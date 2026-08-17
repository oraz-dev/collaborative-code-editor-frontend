import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  fetchYjsState,
  mintWsTicket,
  saveYjsState,
  updateDocumentContent,
  type DocumentRole,
} from '@/entities/Document';
import { logger } from '@/shared/lib/logger/logger';
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

  useEffect(() => {
    if (!documentId || !enabled) return;

    let disposed = false;
    // Mirrors the state below so the persistence closures can read the latest
    // value without being rebuilt when access resolves.
    let canPersist = true;

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(SHARED_TEXT_KEY);
    const yawareness = new Awareness(ydoc);

    const provider = new RelayProvider({
      documentId,
      doc: ydoc,
      awareness: yawareness,
      mintTicket: mintWsTicket,
      onStatusChange: (next) => {
        if (!disposed) setStatus(next);
      },
      onAccessChange: (next) => {
        canPersist = next.canEdit;
        if (!disposed) setAccess(next);
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

    // --- durable state -----------------------------------------------------

    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let resyncTimer: ReturnType<typeof setInterval> | null = null;

    const persistNow = async () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }

      // A viewer has no write access; both of these would come back 403.
      if (!canPersist) return;

      try {
        await Promise.all([
          saveYjsState(documentId, Y.encodeStateAsUpdate(ydoc)),
          // Mirror the plain text too, so previews and first-time readers see
          // real content without having to decode CRDT state.
          updateDocumentContent(documentId, ytext.toString()),
        ]);
      } catch (persistError) {
        // A failed save is not fatal: the CRDT still holds the edit and the
        // next debounce (or another peer) will write it again.
        logger.warn('Could not persist document state', persistError);
      }
    };

    const schedulePersist = (_update: Uint8Array, origin: unknown) => {
      // Remote edits are persisted by whoever made them.
      if (origin === provider) return;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        void persistNow();
      }, PERSIST_DEBOUNCE_MS);
    };

    const flushPending = () => {
      if (persistTimer) void persistNow();
    };

    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };

    // --- bootstrap ---------------------------------------------------------

    const bootstrap = async () => {
      try {
        const persisted = await fetchYjsState(documentId);
        if (disposed) return;

        if (persisted && persisted.length > 0) {
          Y.applyUpdate(ydoc, persisted, 'persisted');
        }
      } catch (loadError) {
        if (disposed) return;
        // Losing the saved state would mean re-seeding and duplicating text,
        // so surface it rather than silently starting from blank.
        logger.error('Could not load saved document state', loadError);
        setError(loadError instanceof Error ? loadError : new Error('Failed to load document'));
        return;
      }

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
      // shared empty file would try to author its first revision.
      if (canPersist && ytext.length === 0 && seed.length > 0 && !hasRemotePeers) {
        ytext.insert(0, seed);
        void persistNow();
      }

      ydoc.on('update', schedulePersist);
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
    setSession({ doc: ydoc, text: ytext, awareness: yawareness });
    setIsReady(false);
    setError(null);

    void bootstrap();

    return () => {
      disposed = true;
      ydoc.off('update', schedulePersist);
      yawareness.off('change', syncPeers);
      window.removeEventListener('beforeunload', flushPending);
      document.removeEventListener('visibilitychange', flushOnHide);

      if (resyncTimer) clearInterval(resyncTimer);

      // Write out anything still sitting in the debounce window.
      if (persistTimer) {
        clearTimeout(persistTimer);
        void persistNow();
      }

      provider.destroy();
      yawareness.destroy();
      ydoc.destroy();
    };
  }, [documentId, enabled]);

  // Presence identity can change (a display-name edit) without a reconnect.
  useEffect(() => {
    if (!session || !user) return;
    session.awareness.setLocalStateField('user', user);
  }, [session, user]);

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
  };
}
