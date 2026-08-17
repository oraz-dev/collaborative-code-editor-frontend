const STORAGE_KEY = 'space:seen-shared-documents';
const MAX_REMEMBERED = 400;

/**
 * Ids of shared documents this browser has already told the user about.
 *
 * Returns null when nothing has ever been stored, which the caller needs to
 * tell apart from "stored, but empty": the first sighting establishes a silent
 * baseline, otherwise signing in on a new machine would announce every
 * document that was ever shared with you.
 */
export function readSeenShared(storage: Storage = localStorage): Set<string> | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    // Private-mode storage and hand-edited values both land here; treating it
    // as "never stored" keeps the first render silent instead of noisy.
    return null;
  }
}

export function writeSeenShared(ids: Iterable<string>, storage: Storage = localStorage): void {
  try {
    // Bounded so a long-lived workspace cannot grow the entry indefinitely.
    const recent = [...ids].slice(-MAX_REMEMBERED);
    storage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // Storage being unavailable only costs a repeated notification.
  }
}

/** Documents present now that this browser has not announced yet. */
export function unseenDocuments<T extends { id: string }>(
  documents: T[],
  seen: Set<string>,
): T[] {
  return documents.filter((document) => !seen.has(document.id));
}
