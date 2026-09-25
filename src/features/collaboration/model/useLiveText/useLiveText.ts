import { useCallback, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

const NO_OP = () => () => {};

/**
 * The shared buffer as a plain string, kept current as anyone edits it.
 *
 * Monaco binds to the CRDT directly, so nothing else in the app needed the
 * text as a value before; a media preview does, because an `.svg` is both the
 * file being edited and the picture on screen, and the picture has to follow
 * the markup as it is typed — including a collaborator's typing.
 *
 * `fallback` covers the window before the session is ready: the document's
 * last saved content, so a file renders the moment it is opened rather than
 * once the socket settles. Where there is a buffer it is the truth, empty or
 * not.
 */
export function useLiveText(text: Y.Text | null, fallback: string): string {
  const subscribe = useCallback((onChange: () => void) => {
    if (!text) return NO_OP();
    text.observe(onChange);
    return () => text.unobserve(onChange);
  }, [text]);

  // A fresh string each call, which is fine: React compares snapshots by
  // value, and two equal strings are the same snapshot.
  const read = useCallback(() => (text ? text.toString() : fallback), [fallback, text]);

  return useSyncExternalStore(subscribe, read);
}
