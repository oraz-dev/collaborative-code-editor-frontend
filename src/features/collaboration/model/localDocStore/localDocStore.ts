import { logger } from '@/shared/lib/logger/logger';
import type { DocumentRole } from '@/entities/Document';

const DB_NAME = 'collab-local-docs';
const DB_VERSION = 1;
const STORE_NAME = 'docs';

/**
 * A document as this browser last saw it.
 *
 * The server is still the source of truth; this is what lets an edit survive
 * a reload while the server is out of reach, and lets a file open at all
 * without it. Being CRDT state, it merges with whatever the server holds
 * rather than competing with it.
 */
export interface LocalDocRecord {
  /** `Y.encodeStateAsUpdate` of the whole document. */
  state: Uint8Array;
  /** True while this copy holds edits the server has not acknowledged. */
  dirty: boolean;
  /**
   * The access level last learned from a ticket. Without it a viewer opening
   * the file offline would be assumed able to edit.
   */
  access?: { role: DocumentRole; canEdit: boolean };
  updatedAt: number;
}

/**
 * Copies are per user as well as per document: on a shared machine the next
 * person to sign in must not be handed someone else's unsynced edits.
 */
function recordKey(userId: string, documentId: string): string {
  return `${userId}:${documentId}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local store'));
    request.onblocked = () => reject(new Error('The local store is blocked by another tab'));
  });

  dbPromise = opening;
  // A failed open is not remembered, so a later call can try again.
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });
  return opening;
}

/** Resolves to null when there is no copy — or no way to read one. */
export async function loadLocalDoc(
  userId: string,
  documentId: string,
): Promise<LocalDocRecord | null> {
  // Absent in some private modes and in older embedded webviews.
  if (typeof indexedDB === 'undefined') return null;

  try {
    const db = await openDb();
    return await new Promise<LocalDocRecord | null>((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(recordKey(userId, documentId));
      request.onsuccess = () => resolve((request.result as LocalDocRecord | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read the local copy'));
    });
  } catch (error) {
    logger.warn('Could not read the local copy of a document', error);
    return null;
  }
}

/**
 * Never rejects: the local copy is a safety net, and failing to write it must
 * not break the editing it exists to protect.
 */
export async function saveLocalDoc(
  userId: string,
  documentId: string,
  record: LocalDocRecord,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record, recordKey(userId, documentId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not write the local copy'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Local write was aborted'));
    });
  } catch (error) {
    logger.warn('Could not write the local copy of a document', error);
  }
}
