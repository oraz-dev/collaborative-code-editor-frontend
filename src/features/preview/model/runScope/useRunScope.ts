import { useCallback, useSyncExternalStore } from 'react';
import type { RunScope } from '../projectEntry/projectEntry';

/**
 * Whether Run starts from the project entry or the open file, remembered for
 * the browser session.
 *
 * Per session rather than saved in preferences: it is a working mode ("I am
 * poking at one component right now"), and a fresh visit that silently kept
 * running one file would look like the project entry was broken.
 *
 * `sessionStorage` survives the pane closing and reopening and switching
 * files; when it is unavailable (a private window, blocked storage) the
 * choice lives in memory for as long as the page does.
 */
const STORAGE_KEY = 'preview.runScope';
const DEFAULT_SCOPE: RunScope = 'project';

let memory: RunScope = DEFAULT_SCOPE;
const listeners = new Set<() => void>();

function isRunScope(value: unknown): value is RunScope {
  return value === 'project' || value === 'file';
}

function readScope(): RunScope {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return isRunScope(stored) ? stored : DEFAULT_SCOPE;
  } catch {
    return memory;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setRunScope(scope: RunScope): void {
  memory = scope;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, scope);
  } catch {
    // Kept in memory instead; see the module comment.
  }
  listeners.forEach((listener) => listener());
}

export function useRunScope(): [RunScope, (scope: RunScope) => void] {
  const scope = useSyncExternalStore(subscribe, readScope, () => DEFAULT_SCOPE);
  const update = useCallback((next: RunScope) => setRunScope(next), []);
  return [scope, update];
}
