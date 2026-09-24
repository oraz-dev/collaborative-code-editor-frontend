import { useSyncExternalStore } from 'react';
import { logger } from '@/shared/lib/logger/logger';

/**
 * What the user chooses about code completion: when it runs, and how much it
 * may write.
 *
 * The same shape and the same two rules as `aiSettings`: every storage access
 * is wrapped, because a private window throws on `localStorage` and a quota
 * error must cost the setting rather than the session; and an external store
 * rather than context, because the settings screen writes and the editor
 * reads, and neither should re-render the tree through a provider.
 *
 * No credential is stored here either. Both backends are this app's own
 * origin, and both keys live in the server's environment.
 */

export const COMPLETE_SETTINGS_STORAGE_KEY = 'space:ai-complete-settings';

/**
 * - `off`: no suggestions at all, and no requests.
 * - `onDemand`: only when asked for, with Cmd+I. Free-tier OpenRouter, fifty
 *   requests a day, which is workable precisely because it is deliberate.
 * - `asYouType`: ghost text while typing, which needs the fast backend. It can
 *   be chosen while that backend has no key — it simply does not run, and the
 *   status bar says so rather than leaving the user waiting for nothing.
 */
export type CompleteMode = 'off' | 'onDemand' | 'asYouType';

export interface CompleteSettings {
  mode: CompleteMode;
  /** True while a suggestion may not span lines — the safer default. */
  singleLine: boolean;
}

const MODES: CompleteMode[] = ['off', 'onDemand', 'asYouType'];

/**
 * `onDemand`, because it is the backend that actually works today: the fast
 * route has no provider key yet, so defaulting to `asYouType` would ship a
 * feature that silently does nothing.
 */
export const DEFAULT_COMPLETE_SETTINGS: CompleteSettings = {
  mode: 'onDemand',
  singleLine: true,
};

type Listener = () => void;

/** Keeps a hand-edited or half-written storage entry from becoming a crash. */
function normalise(value: unknown): CompleteSettings {
  if (!value || typeof value !== 'object') return DEFAULT_COMPLETE_SETTINGS;
  const { mode, singleLine } = value as Record<string, unknown>;

  return {
    mode: MODES.includes(mode as CompleteMode) ? (mode as CompleteMode) : DEFAULT_COMPLETE_SETTINGS.mode,
    singleLine: singleLine !== false,
  };
}

function write(next: CompleteSettings): void {
  try {
    localStorage.setItem(COMPLETE_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // The error, never the settings: nothing decides what a logger does with
    // an object it is handed.
    logger.warn('Could not save the completion settings', error);
  }
}

function read(): CompleteSettings {
  try {
    const raw = localStorage.getItem(COMPLETE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_COMPLETE_SETTINGS;
    return normalise(JSON.parse(raw));
  } catch {
    // Private mode, blocked site data, or corrupt JSON. The defaults are the
    // right answer for all three.
    return DEFAULT_COMPLETE_SETTINGS;
  }
}

let current: CompleteSettings = read();
const listeners = new Set<Listener>();

function persist(next: CompleteSettings): void {
  current = next;
  write(next);
  listeners.forEach((listener) => listener());
}

export const completeSettingsStore = {
  get(): CompleteSettings {
    return current;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setMode(mode: CompleteMode): void {
    persist({ ...current, mode: MODES.includes(mode) ? mode : DEFAULT_COMPLETE_SETTINGS.mode });
  },

  setSingleLine(singleLine: boolean): void {
    persist({ ...current, singleLine });
  },

  reset(): void {
    persist(DEFAULT_COMPLETE_SETTINGS);
  },

  /** Test seam, as in `aiSettings`: re-reads storage from a known state. */
  reload(): void {
    current = read();
    listeners.forEach((listener) => listener());
  },
};

function getServerSnapshot(): CompleteSettings {
  return DEFAULT_COMPLETE_SETTINGS;
}

export function useCompleteSettings(): CompleteSettings {
  return useSyncExternalStore(completeSettingsStore.subscribe, completeSettingsStore.get, getServerSnapshot);
}
