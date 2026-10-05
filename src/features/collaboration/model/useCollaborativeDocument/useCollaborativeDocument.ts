import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  fetchYjsState,
  mintWsTicket,
  saveYjsState,
  updateDocumentContent,
  type DocumentRole,
} from '@/entities/Document';
import { isApiError } from '@/shared/api';
import { logger } from '@/shared/lib/logger/logger';
import { trackPendingWrite } from '@/shared/lib/pendingWrites/pendingWrites';
import {
  IDLE_RUN_STATE,
  beginLocalRun,
  localRunFailure,
  reduceRunState,
  type RunState,
} from '../runState/runState';
import type { ControlFrame } from '../types/controlFrames';
import { loadLocalDoc, saveLocalDoc, type LocalDocRecord } from '../localDocStore/localDocStore';
import { RelayProvider, type ConnectionStatus } from '../RelayProvider/RelayProvider';
import { readPeers, type AwarenessUser, type PresencePeer } from '../presence/presence';

/** Shared text root — every client must agree on this name to see the same text. */
export const SHARED_TEXT_KEY = 'monaco';

/**
 * How long to wait for peers to sync before deciding a document is genuinely
 * empty and needs seeding from its plain-text `content`.
 */
const SEED_GRACE_PERIOD_MS = 1_200;

/** Persistence is debounced; typing should not mean a request per keystroke. */
const PERSIST_DEBOUNCE_MS = 2_000;

/** A sync that failed is retried with backoff until it lands. */
const BASE_SYNC_RETRY_MS = 2_000;
const MAX_SYNC_RETRY_MS = 30_000;

/**
 * How often a viewer re-pulls the saved state.
 *
 * A viewer's socket is send-blocked by the relay, so they cannot ask peers for
 * a sync. If they joined against a snapshot older than the edits now arriving,
 * Yjs holds those updates pending and the text would quietly stop moving.
 * Re-reading the snapshot supplies the missing base and the pending updates
 * integrate themselves.
 */
const VIEWER_RESYNC_INTERVAL_MS = 15_000;

const NO_PEERS: PresencePeer[] = [];

interface DocumentSession {
  doc: Y.Doc;
  text: Y.Text;
  awareness: Awareness;
}

export interface UseCollaborativeDocumentOptions {
  documentId: string | null | undefined;
  user: AwarenessUser | null;
  /** Plain-text fallback used only when the document has no CRDT state yet. */
  initialContent?: string;
  enabled?: boolean;
}

export interface CollaborativeDocument {
  doc: Y.Doc | null;
  text: Y.Text | null;
  awareness: Awareness | null;
  status: ConnectionStatus;
  peers: PresencePeer[];
  isReady: boolean;
  error: Error | null;
  /** The caller's access level, learned from the ws-ticket. */
  role: DocumentRole;
  canEdit: boolean;
  /**
   * True while edits are waiting on a server that could not be reached. They
   * are held in the document, and in this browser's local copy, and go out on
   * their own once the server answers.
   */
  hasUnsyncedChanges: boolean;
  /**
   * The document's execution state. Shared by the whole room, not per viewer:
   * the server broadcasts a run's lifecycle to everyone watching, so a
   * collaborator sees the owner's output as it lands.
   */
  runState: RunState;
  /**
   * Asks the server to run the document. Only the owner may; anyone else gets
   * a `forbidden` failure back rather than silence.
   *
   * Returns false when the socket was not open, in which case nothing was
   * sent and `runState` reports it.
   */
  run: (request: { languageId: number; sourceCode: string; stdin?: string }) => boolean;
}

export function useCollaborativeDocument(
  options: UseCollaborativeDocumentOptions,
): CollaborativeDocument {
  const { documentId, user, initialContent, enabled = true } = options;

  const [session, setSession] = useState<DocumentSession | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [peers, setPeers] = useState<PresencePeer[]>(NO_PEERS);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Assume write access until the ticket says otherwise, so the common case
  // never flickers into a read-only state on open.
  const [access, setAccess] = useState<{ role: DocumentRole; canEdit: boolean }>({
    role: 'editor',
    canEdit: true,
  });
  const [runState, setRunState] = useState<RunState>(IDLE_RUN_STATE);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);

  // The provider is not render state — nothing re-renders when it changes —
  // but `run` has to reach the live one, so it is held in a ref rather than
  // threaded through `session`.
  const providerRef = useRef<RelayProvider | null>(null);

  // Read once during bootstrap; kept in refs so a changing identity or a
  // late-arriving content string never tears the live document down.
  const userRef = useRef(user);
  const initialContentRef = useRef(initialContent);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    initialContentRef.current = initialContent;
  }, [initialContent]);

  const isActive = Boolean(documentId) && enabled;
  // The local copy is filed under the user, so a different one means a
  // different document session — unlike a mere display-name change.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!documentId || !enabled) return;

    let disposed = false;
    // Mirrors the state below so the persistence closures can read the latest
    // value without being rebuilt when access resolves.
    let canPersist = true;
    let access: LocalDocRecord['access'];

    // --- sync bookkeeping --------------------------------------------------

    /** Local edits the server has not acknowledged yet. */
    let dirty = false;
    /** Bumped per local edit, so a save can tell whether it was overtaken. */
    let localVersion = 0;
    /**
     * The server may hold edits this client has not seen: the socket dropped,
     * a save failed, or the file was opened from the local copy alone. Saving
     * replaces the stored state wholesale, so while this is set a save is
     * always preceded by a fetch-and-merge — otherwise coming back from
     * offline would write over whatever was saved in the meantime.
     */
    let needsMerge = false;
    /** The last attempt to reach the server failed. */
    let stalled = false;
    let syncing = false;
    let syncQueued = false;
    let retryAttempt = 0;
    let wasConnected = false;
    /** Nothing is written locally until the local copy has been read back. */
    let localLoaded = false;

    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let resyncTimer: ReturnType<typeof setInterval> | null = null;
    let localWrite: Promise<void> | null = null;
    let localWriteQueued = false;

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(SHARED_TEXT_KEY);
    const yawareness = new Awareness(ydoc);

    const publishUnsynced = () => {
      if (!disposed) setHasUnsyncedChanges(dirty && stalled);
    };

    // --- local copy --------------------------------------------------------

    const snapshot = (): LocalDocRecord => ({
      state: Y.encodeStateAsUpdate(ydoc),
      dirty,
      access,
      updatedAt: Date.now(),
    });

    /** One write at a time; a burst of typing collapses into the latest state. */
    const writeLocal = () => {
      if (!userId || !localLoaded || disposed) return;
      if (localWrite) {
        localWriteQueued = true;
        return;
      }

      localWrite = saveLocalDoc(userId, documentId, snapshot()).finally(() => {
        localWrite = null;
        if (localWriteQueued) {
          localWriteQueued = false;
          writeLocal();
        }
      });
    };

    // --- durable state -----------------------------------------------------

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      const delay = Math.min(BASE_SYNC_RETRY_MS * 2 ** retryAttempt, MAX_SYNC_RETRY_MS);
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void syncWithServer();
      }, delay);
    };

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    /**
     * Brings this client and the server level: pulls in what the server has
     * if that may be news, then writes back anything it is missing.
     */
    const syncWithServer = async (): Promise<void> => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (disposed) return;
      if (syncing) {
        syncQueued = true;
        return;
      }

      // No point spending a request the browser already knows will fail; the
      // `online` listener picks this back up.
      if (!navigator.onLine) {
        needsMerge = true;
        stalled = true;
        publishUnsynced();
        return;
      }

      syncing = true;
      try {
        if (needsMerge) {
          const remote = await fetchYjsState(documentId);
          if (disposed) return;
          if (remote && remote.length > 0) Y.applyUpdate(ydoc, remote, 'persisted');
          needsMerge = false;
        }

        // A viewer has no write access; both of these would come back 403.
        if (dirty && canPersist) {
          const version = localVersion;
          // Registered, so a reader of the text mirror — the preview loading the
          // project on Run — can wait for this save instead of overtaking it.
          await trackPendingWrite(Promise.all([
            saveYjsState(documentId, Y.encodeStateAsUpdate(ydoc)),
            // Mirror the plain text too, so previews and first-time readers see
            // real content without having to decode CRDT state.
            updateDocumentContent(documentId, ytext.toString()),
          ]));
          if (disposed) return;

          // Otherwise typing continued while the save was in the air, and the
          // debounce those edits started will send the rest.
          if (version === localVersion) {
            dirty = false;
            writeLocal();
          }
        }

        retryAttempt = 0;
        clearRetry();
        stalled = false;
        publishUnsynced();
      } catch (syncError) {
        if (disposed) return;
        // Not fatal: the CRDT and the local copy both still hold the edit.
        logger.warn('Could not sync document state', syncError);
        needsMerge = true;
        stalled = true;
        publishUnsynced();

        // Access revoked or the document deleted — asking again will not help.
        const refused = isApiError(syncError) && (syncError.isForbidden || syncError.isNotFound);
        if (!refused) scheduleRetry();
      } finally {
        syncing = false;
        if (syncQueued && !disposed) {
          syncQueued = false;
          void syncWithServer();
        }
      }
    };

    const handleDocUpdate = (_update: Uint8Array, origin: unknown) => {
      // Remote edits are persisted by whoever made them, and state read back
      // from the server is by definition already there.
      const isLocalEdit = origin !== provider && origin !== 'persisted';

      if (isLocalEdit) {
        dirty = true;
        localVersion += 1;
        publishUnsynced();

        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
          persistTimer = null;
          void syncWithServer();
        }, PERSIST_DEBOUNCE_MS);
      }

      // Every change is kept locally, remote ones included, so the copy a
      // later offline open starts from is as fresh as this tab was.
      writeLocal();
    };

    const flushPending = () => {
      if (persistTimer) void syncWithServer();
    };

    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };

    const handleOnline = () => {
      if (!dirty && !needsMerge) return;
      clearRetry();
      void syncWithServer();
    };

    const provider = new RelayProvider({
      documentId,
      doc: ydoc,
      awareness: yawareness,
      mintTicket: mintWsTicket,
      onStatusChange: (next) => {
        if (disposed) return;
        setStatus(next);

        if (next === 'connected') {
          wasConnected = true;
          // The relay keeps no state, so a reconnect only catches up with
          // peers still in the room. The saved state covers the rest.
          if (needsMerge || dirty) {
            clearRetry();
            void syncWithServer();
          }
        } else if (wasConnected) {
          wasConnected = false;
          needsMerge = true;
        }
      },
      onAccessChange: (next) => {
        canPersist = next.canEdit;
        access = next;
        if (!next.canEdit && dirty) {
          // Nothing a viewer typed can ever be saved, so it is not "pending".
          dirty = false;
          publishUnsynced();
        }
        writeLocal();
        if (!disposed) setAccess(next);
      },
      onControlFrame: (frame: ControlFrame) => {
        if (!disposed) setRunState((current) => reduceRunState(current, frame));
      },
    });

    const localUser = userRef.current;
    if (localUser) {
      yawareness.setLocalStateField('user', localUser);
    }

    const syncPeers = () => {
      if (!disposed) setPeers(readPeers(yawareness.getStates(), ydoc.clientID));
    };
    yawareness.on('change', syncPeers);

    // --- bootstrap ---------------------------------------------------------

    const bootstrap = async () => {
      // The local copy goes in first: it is what lets the file open with the
      // server out of reach, and it may hold edits that never got there.
      let hasLocalCopy = false;
      const local = userId ? await loadLocalDoc(userId, documentId) : null;
      if (disposed) return;

      if (local) {
        try {
          Y.applyUpdate(ydoc, local.state, 'persisted');
          hasLocalCopy = true;

          if (local.access) {
            access = local.access;
            canPersist = local.access.canEdit;
            setAccess(local.access);
          }
          dirty = local.dirty && canPersist;
        } catch (localError) {
          logger.warn('Discarded an unreadable local copy', localError);
        }
      }

      localLoaded = true;
      ydoc.on('update', handleDocUpdate);
      window.addEventListener('online', handleOnline);

      let serverMerged = false;
      try {
        const persisted = await fetchYjsState(documentId);
        if (disposed) return;

        if (persisted && persisted.length > 0) {
          Y.applyUpdate(ydoc, persisted, 'persisted');
        }
        serverMerged = true;
      } catch (loadError) {
        if (disposed) return;

        if (!hasLocalCopy) {
          // Losing the saved state would mean re-seeding and duplicating text,
          // so surface it rather than silently starting from blank.
          logger.error('Could not load saved document state', loadError);
          setError(loadError instanceof Error ? loadError : new Error('Failed to load document'));
          return;
        }

        // Carry on from the local copy; the merge happens once the server answers.
        logger.warn('Opened a document from its local copy', loadError);
        needsMerge = true;
        stalled = true;
        publishUnsynced();
        scheduleRetry();
      }

      // Edits left over from a session that ended before they were saved.
      if (serverMerged && dirty) void syncWithServer();

      provider.connect();

      // Give peers a moment to answer our SyncStep1 before concluding the
      // document is empty — seeding twice would duplicate the file's text.
      await new Promise((resolve) => setTimeout(resolve, SEED_GRACE_PERIOD_MS));
      if (disposed) return;

      const seed = initialContentRef.current ?? '';
      const hasRemotePeers = Array.from(yawareness.getStates().keys()).some(
        (clientId) => clientId !== ydoc.clientID,
      );

      // Seeding is a write, so a viewer must never do it — otherwise opening a
      // shared empty file would try to author its first revision. Nor may a
      // client that has not heard from the server: "empty" is then only a guess.
      if (canPersist && serverMerged && ytext.length === 0 && seed.length > 0 && !hasRemotePeers) {
        ytext.insert(0, seed);
        void syncWithServer();
      }

      window.addEventListener('beforeunload', flushPending);
      document.addEventListener('visibilitychange', flushOnHide);

      resyncTimer = setInterval(() => {
        // Editors keep up through the socket; only a send-blocked viewer needs this.
        if (canPersist || document.visibilityState === 'hidden') return;

        fetchYjsState(documentId)
          .then((state) => {
            if (!disposed && state && state.length > 0) {
              Y.applyUpdate(ydoc, state, 'persisted');
            }
          })
          .catch((resyncError) => {
            logger.warn('Viewer resync failed', resyncError);
          });
      }, VIEWER_RESYNC_INTERVAL_MS);

      setIsReady(true);
      syncPeers();
    };

    // Publishing the freshly created Yjs handles is what makes them reachable
    // from render; the objects are external resources this effect owns.
    providerRef.current = provider;
    setSession({ doc: ydoc, text: ytext, awareness: yawareness });
    setIsReady(false);
    setError(null);
    setHasUnsyncedChanges(false);

    void bootstrap();

    return () => {
      // Taken before `disposed` flips, while the document is still intact.
      const finalRecord = localLoaded ? snapshot() : null;
      const finalText = ytext.toString();
      const owesServer = dirty && canPersist;

      disposed = true;
      ydoc.off('update', handleDocUpdate);
      yawareness.off('change', syncPeers);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('beforeunload', flushPending);
      document.removeEventListener('visibilitychange', flushOnHide);

      if (resyncTimer) clearInterval(resyncTimer);
      if (persistTimer) clearTimeout(persistTimer);
      clearRetry();

      if (finalRecord && userId) void saveLocalDoc(userId, documentId, finalRecord);

      // Write out anything the server has not seen. Skipped while a merge is
      // owed: saving blind could overwrite newer state, and the local copy
      // carries the edit to the next session instead.
      if (finalRecord && owesServer && !needsMerge) {
        trackPendingWrite(Promise.all([
          saveYjsState(documentId, finalRecord.state),
          updateDocumentContent(documentId, finalText),
        ]))
          .then(() => {
            if (userId) void saveLocalDoc(userId, documentId, { ...finalRecord, dirty: false });
          })
          .catch((persistError: unknown) => {
            logger.warn('Could not persist document state on close', persistError);
          });
      }

      providerRef.current = null;
      provider.destroy();
      yawareness.destroy();
      ydoc.destroy();
    };
  }, [documentId, enabled, userId]);

  // Presence identity can change (a display-name edit) without a reconnect.
  useEffect(() => {
    if (!session || !user) return;
    session.awareness.setLocalStateField('user', user);
  }, [session, user]);

  const run = useCallback((request: { languageId: number; sourceCode: string; stdin?: string }) => {
    const provider = providerRef.current;

    // Optimistic: the button should react to the click, not to the round
    // trip. The server's own `run:started` overwrites this a moment later
    // with the authoritative requester.
    setRunState((current) => beginLocalRun(current, request.languageId, userRef.current?.id ?? null));

    const sent = provider?.sendRun({
      language_id: request.languageId,
      source_code: request.sourceCode,
      stdin: request.stdin,
    }) ?? false;

    if (!sent) setRunState(localRunFailure);
    return sent;
  }, []);

  // While inactive the stale session is simply not surfaced, which avoids
  // resetting state from inside an effect.
  return {
    doc: isActive ? session?.doc ?? null : null,
    text: isActive ? session?.text ?? null : null,
    awareness: isActive ? session?.awareness ?? null : null,
    status: isActive ? status : 'offline',
    peers: isActive ? peers : NO_PEERS,
    isReady: isActive && isReady,
    error: isActive ? error : null,
    role: access.role,
    canEdit: access.canEdit,
    hasUnsyncedChanges: isActive && hasUnsyncedChanges,
    runState: isActive ? runState : IDLE_RUN_STATE,
    run,
  };
}
