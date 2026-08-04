import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
  type Awareness,
} from 'y-protocols/awareness';
import { messageYjsSyncStep1, readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync';
import { bytesToBase64, base64ToBytes } from '@/shared/lib/base64/base64';
import { logger } from '@/shared/lib/logger/logger';
import { resolveWebSocketUrl } from '@/shared/api';
import type { WsTicket } from '@/entities/Document';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 20_000;
/**
 * Doubles as a keepalive and an anti-entropy repair pass — see `startHeartbeat`.
 * Must stay under y-protocols' 30s awareness timeout, otherwise peers would
 * expire each other's cursors between beats.
 */
const HEARTBEAT_INTERVAL_MS = 20_000;

export type ConnectionStatus = 'connecting' | 'connected' | 'offline' | 'error';

export interface RelayProviderOptions {
  documentId: string;
  doc: Y.Doc;
  awareness: Awareness;
  /** Tickets expire in ~15s, so one is minted per connection attempt. */
  mintTicket: (documentId: string) => Promise<WsTicket>;
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Fires when the ticket reveals the caller's access level. */
  onAccessChange?: (access: { role: WsTicket['role']; canEdit: boolean }) => void;
}

/**
 * Yjs provider for this backend's collaboration socket.
 *
 * The server is a plain broadcast relay: it does not understand Yjs, never
 * answers a sync request itself, and re-emits every frame it receives as a
 * *text* frame. A single non-UTF-8 byte in a payload drops the receiving peer
 * with code 1006 — which raw Yjs updates are full of. So every protocol
 * message is base64-encoded before it goes out and decoded on the way in.
 *
 * Because the relay holds no state, peers sync directly with each other
 * (SyncStep1/SyncStep2 on join) and the document's durable state is loaded
 * and saved separately through the /yjs-state endpoint.
 */
export class RelayProvider {
  readonly documentId: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;

  private readonly mintTicket: (documentId: string) => Promise<WsTicket>;
  private readonly onStatusChange?: (status: ConnectionStatus) => void;
  private readonly onAccessChange?: (access: { role: WsTicket['role']; canEdit: boolean }) => void;

  /**
   * A viewer's socket is receive-only — the relay drops anything it sends — so
   * we stop transmitting rather than pushing updates into a void.
   */
  private canEdit = true;

  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'offline';
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  /** Guards against a late-arriving socket from a superseded attempt. */
  private connectionEpoch = 0;

  constructor(options: RelayProviderOptions) {
    this.documentId = options.documentId;
    this.doc = options.doc;
    this.awareness = options.awareness;
    this.mintTicket = options.mintTicket;
    this.onStatusChange = options.onStatusChange;
    this.onAccessChange = options.onAccessChange;

    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
    window.addEventListener('online', this.handleBrowserOnline);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    if (this.destroyed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    void this.openSocket();
  }

  disconnect(): void {
    this.clearRetry();
    this.stopHeartbeat();
    this.closeSocket();
    this.setStatus('offline');
  }

  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    window.removeEventListener('online', this.handleBrowserOnline);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }

  private async openSocket(): Promise<void> {
    this.connectionEpoch += 1;
    const epoch = this.connectionEpoch;
    this.setStatus('connecting');

    let ticket: WsTicket;
    try {
      ticket = await this.mintTicket(this.documentId);
    } catch (error) {
      logger.warn('Could not mint a collaboration ticket', error);
      this.setStatus('error');
      this.scheduleRetry();
      return;
    }

    // A newer attempt started (or we were torn down) while minting.
    if (this.destroyed || epoch !== this.connectionEpoch) return;

    this.canEdit = ticket.canEdit;
    this.onAccessChange?.({ role: ticket.role, canEdit: ticket.canEdit });

    try {
      const socket = new WebSocket(resolveWebSocketUrl(this.documentId, ticket.ticket));
      this.ws = socket;

      socket.onopen = () => {
        if (epoch !== this.connectionEpoch) return;
        this.retryAttempt = 0;
        this.setStatus('connected');
        this.sendSyncStep1();
        this.sendLocalAwareness();
        this.startHeartbeat();
      };

      socket.onmessage = (event) => {
        if (epoch === this.connectionEpoch) this.handleMessage(event.data);
      };

      socket.onerror = () => {
        if (epoch === this.connectionEpoch) this.setStatus('error');
      };

      socket.onclose = () => {
        if (epoch !== this.connectionEpoch) return;
        this.stopHeartbeat();
        this.dropRemoteAwareness();
        this.setStatus('offline');
        this.scheduleRetry();
      };
    } catch (error) {
      logger.warn('Could not open the collaboration socket', error);
      this.setStatus('error');
      this.scheduleRetry();
    }
  }

  private closeSocket(): void {
    // Invalidate in-flight handlers before tearing the socket down.
    this.connectionEpoch += 1;
    const socket = this.ws;
    this.ws = null;
    if (!socket) return;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      try {
        socket.close();
      } catch {
        // already closing — nothing to do
      }
    }
  }

  private scheduleRetry(): void {
    if (this.destroyed || this.retryTimer) return;

    // Exponential backoff with jitter so a room full of clients coming back
    // from a network blip does not reconnect in lockstep.
    const base = Math.min(BASE_RETRY_DELAY_MS * 2 ** this.retryAttempt, MAX_RETRY_DELAY_MS);
    const delay = base * (0.7 + Math.random() * 0.6);
    this.retryAttempt += 1;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.openSocket();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryAttempt = 0;
  }

  /** Reconnect promptly when the OS says the link is back, instead of waiting out the backoff. */
  private handleBrowserOnline = (): void => {
    if (this.destroyed || this.status === 'connected') return;
    this.clearRetry();
    void this.openSocket();
  };

  /**
   * Periodic SyncStep1 keeps idle connections from being reaped by
   * intermediaries and repairs any divergence caused by a dropped frame —
   * the relay offers no delivery guarantee, so peers reconcile themselves.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.sendSyncStep1();
      // Re-announce presence so peers do not time our cursor out at 30s.
      this.sendLocalAwareness();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(payload: Uint8Array): void {
    const socket = this.ws;
    if (socket?.readyState !== WebSocket.OPEN) return;

    // The relay discards everything a viewer sends, so transmitting would only
    // burn bandwidth. A viewer still receives fine: their starting point is the
    // persisted state fetched over HTTP, and live edits arrive as broadcasts.
    if (!this.canEdit) return;

    try {
      // base64, because the relay stringifies frames and any byte that is not
      // valid UTF-8 disconnects the peers receiving it.
      socket.send(bytesToBase64(payload));
    } catch (error) {
      logger.warn('Failed to send a collaboration message', error);
    }
  }

  private sendSyncStep1(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    writeSyncStep1(encoder, this.doc);
    this.send(encoding.toUint8Array(encoder));
  }

  private sendLocalAwareness(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
    );
    this.send(encoding.toUint8Array(encoder));
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string' || data.length === 0) return;

    let payload: Uint8Array;
    try {
      payload = base64ToBytes(data);
    } catch {
      logger.warn('Discarded a malformed collaboration frame');
      return;
    }

    try {
      const decoder = decoding.createDecoder(payload);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        // `this` as the origin marks the change as remote so the update
        // handler does not echo it straight back to the room.
        const syncStep = readSyncMessage(decoder, encoder, this.doc, this);

        // A reply was produced (e.g. SyncStep2 answering a peer's SyncStep1).
        if (encoding.length(encoder) > 1) {
          this.send(encoding.toUint8Array(encoder));
        }

        // SyncStep1 means a peer just joined or is resyncing, and the relay
        // keeps no state to tell them who else is here — so everyone already
        // in the room answers with their own presence.
        if (syncStep === messageYjsSyncStep1) {
          this.sendLocalAwareness();
        }
        return;
      }

      if (messageType === MESSAGE_AWARENESS) {
        applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
      }
    } catch (error) {
      logger.warn('Failed to process a collaboration frame', error);
    }
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // Updates we just applied from a peer must not be bounced back.
    if (origin === this) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    writeUpdate(encoder, update);
    this.send(encoding.toUint8Array(encoder));
  };

  private handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return;

    const changed = [...changes.added, ...changes.updated, ...changes.removed];
    if (changed.length === 0) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, changed));
    this.send(encoding.toUint8Array(encoder));
  };

  /** On a drop, everyone else's cursor is stale — clear them so the UI stays honest. */
  private dropRemoteAwareness(): void {
    const remoteClients = Array.from(this.awareness.getStates().keys()).filter(
      (clientId) => clientId !== this.doc.clientID,
    );
    if (remoteClients.length > 0) {
      removeAwarenessStates(this.awareness, remoteClients, 'connection lost');
    }
  }
}
