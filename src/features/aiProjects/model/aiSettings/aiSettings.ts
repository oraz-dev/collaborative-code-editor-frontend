import { useSyncExternalStore } from 'react';
import { logger } from '@/shared/lib/logger/logger';
import { DEFAULT_MODEL } from '../modelChain/modelChain';

/**
 * What the user chooses about the assistant: which model, and whether a busy
 * one may fall through to the next.
 *
 * No credential lives here. The OpenRouter key is held by the server and
 * attached by the `/api/ai/v1` proxy, so the browser has nothing to store and
 * nothing to leak. An earlier version of this app did ask each user for their
 * own key and kept it in this very entry — `read` therefore drops any `apiKey`
 * it finds and writes the settings back without it, so an old key is erased
 * on the first load rather than left sitting in `localStorage` forever.
 *
 * Two rules the rest follows from:
 *
 * 1. Every storage access is wrapped: a private window throws on
 *    `localStorage`, and a quota error must cost the setting, not the session.
 * 2. An external store rather than context, matching `preferencesStore`: the
 *    settings screen writes, the generator reads, and neither should re-render
 *    the tree through a provider.
 */

export const AI_SETTINGS_STORAGE_KEY = 'space:ai-settings';

export interface AiSettings {
  /** Preferred model id; the head of the chain a generation starts from. */
  modelId: string;
  /** Whether a busy model may fall through to the next one in the chain. */
  fallbackEnabled: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  modelId: DEFAULT_MODEL,
  fallbackEnabled: true,
};

type Listener = () => void;

/** Keeps a hand-edited or half-written storage entry from becoming a crash. */
function normalise(value: unknown): AiSettings {
  if (!value || typeof value !== 'object') return DEFAULT_AI_SETTINGS;
  const { modelId, fallbackEnabled } = value as Record<string, unknown>;

  return {
    modelId: typeof modelId === 'string' && modelId ? modelId : DEFAULT_MODEL,
    fallbackEnabled: fallbackEnabled !== false,
  };
}

/** A key left behind by the version that asked the user for one. */
function holdsStoredKey(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && 'apiKey' in (value as object);
}

function write(next: AiSettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // The error, never the settings: nothing decides what a logger does with
    // an object it is handed.
    logger.warn('Could not save the AI settings', error);
  }
}

function read(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;

    const parsed: unknown = JSON.parse(raw);
    const settings = normalise(parsed);
    // Dropped on the way in and erased on the way out. It is never read into
    // memory, never given to a client and never sent anywhere.
    if (holdsStoredKey(parsed)) write(settings);
    return settings;
  } catch {
    // Private mode, blocked site data, or corrupt JSON. The defaults are the
    // right answer for all three.
    return DEFAULT_AI_SETTINGS;
  }
}

let current: AiSettings = read();
const listeners = new Set<Listener>();

function persist(next: AiSettings): void {
  current = next;
  write(next);
  listeners.forEach((listener) => listener());
}

export const aiSettingsStore = {
  get(): AiSettings {
    return current;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setModelId(modelId: string): void {
    persist({ ...current, modelId: modelId || DEFAULT_MODEL });
  },

  setFallbackEnabled(fallbackEnabled: boolean): void {
    persist({ ...current, fallbackEnabled });
  },

  reset(): void {
    persist(DEFAULT_AI_SETTINGS);
  },

  /** Test seam, as in `preferencesStore`: re-reads storage from a known state. */
  reload(): void {
    current = read();
    listeners.forEach((listener) => listener());
  },
};

function getServerSnapshot(): AiSettings {
  return DEFAULT_AI_SETTINGS;
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(aiSettingsStore.subscribe, aiSettingsStore.get, getServerSnapshot);
}
