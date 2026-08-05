import { logger } from '@/shared/lib/logger/logger';
import {
  DEFAULT_PREFERENCES,
  normalisePreferences,
  type AppearancePreferences,
  type CollaborationPreferences,
  type EditorPreferences,
  type Preferences,
} from './types/preferences';

export const PREFERENCES_STORAGE_KEY = 'space:preferences';

type Listener = () => void;

function read(): Preferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return normalisePreferences(JSON.parse(raw));
  } catch {
    // Private mode, a quota error, or corrupt JSON — defaults are fine.
    return DEFAULT_PREFERENCES;
  }
}

let current: Preferences = read();
const listeners = new Set<Listener>();

function persist(next: Preferences): void {
  current = next;
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // Losing persistence should not lose the setting for this session.
    logger.warn('Could not save preferences', error);
  }
  listeners.forEach((listener) => listener());
}

/**
 * A plain external store rather than context: preferences are read from
 * scattered places (settings screens, the editor, the theme effect) and change
 * rarely, so `useSyncExternalStore` avoids re-rendering the tree through a
 * provider. There is no server for these, so localStorage is the record.
 */
export const preferencesStore = {
  get(): Preferences {
    return current;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setAppearance(patch: Partial<AppearancePreferences>): void {
    persist(normalisePreferences({ ...current, appearance: { ...current.appearance, ...patch } }));
  },

  setEditor(patch: Partial<EditorPreferences>): void {
    persist(normalisePreferences({ ...current, editor: { ...current.editor, ...patch } }));
  },

  setCollaboration(patch: Partial<CollaborationPreferences>): void {
    persist(normalisePreferences({ ...current, collaboration: { ...current.collaboration, ...patch } }));
  },

  reset(): void {
    persist(DEFAULT_PREFERENCES);
  },

  /** Test seam — re-reads localStorage so specs can start from a known state. */
  reload(): void {
    current = read();
    listeners.forEach((listener) => listener());
  },
};
