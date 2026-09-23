import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { DEFAULT_MODEL } from '../modelChain/modelChain';
import {
  AI_SETTINGS_STORAGE_KEY,
  DEFAULT_AI_SETTINGS,
  aiSettingsStore,
  useAiSettings,
} from './aiSettings';

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(AI_SETTINGS_STORAGE_KEY) ?? '{}');
}

beforeEach(() => {
  localStorage.clear();
  aiSettingsStore.reload();
});

describe('aiSettingsStore', () => {
  test('starts from the defaults, on the default model', () => {
    expect(aiSettingsStore.get()).toEqual(DEFAULT_AI_SETTINGS);
    expect(aiSettingsStore.get().modelId).toBe(DEFAULT_MODEL);
  });

  test('holds no credential of any kind', () => {
    aiSettingsStore.setModelId('nex-agi/nex-n2.5-pro:free');

    expect(Object.keys(aiSettingsStore.get()).sort()).toEqual(['fallbackEnabled', 'modelId']);
    expect(Object.keys(stored()).sort()).toEqual(['fallbackEnabled', 'modelId']);
  });

  test('persists each setting and survives a reload', () => {
    aiSettingsStore.setModelId('nex-agi/nex-n2.5-pro:free');
    aiSettingsStore.setFallbackEnabled(false);
    aiSettingsStore.reload();

    expect(aiSettingsStore.get()).toEqual({
      modelId: 'nex-agi/nex-n2.5-pro:free',
      fallbackEnabled: false,
    });
  });

  test('notifies subscribers until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = aiSettingsStore.subscribe(listener);

    aiSettingsStore.setFallbackEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    aiSettingsStore.setFallbackEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('falls back to the defaults when the stored value is corrupt', () => {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, 'not json{');
    aiSettingsStore.reload();

    expect(aiSettingsStore.get()).toEqual(DEFAULT_AI_SETTINGS);
  });

  test('repairs a half-written stored value', () => {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify({ modelId: '' }));
    aiSettingsStore.reload();

    expect(aiSettingsStore.get()).toEqual(DEFAULT_AI_SETTINGS);
  });

  test('survives a private window, where localStorage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    aiSettingsStore.reload();
    expect(aiSettingsStore.get()).toEqual(DEFAULT_AI_SETTINGS);

    // The setting still applies for this session; only persistence is lost.
    expect(() => aiSettingsStore.setFallbackEnabled(false)).not.toThrow();
    expect(aiSettingsStore.get().fallbackEnabled).toBe(false);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('a key stored by the old, bring-your-own-key version', () => {
  /**
   * Stands in for the key that used to be kept here — deliberately not
   * key-shaped, because nothing in this store has ever inspected the shape,
   * and a fixture that looks like a credential has no business in the suite.
   * It must not be loaded, kept, sent anywhere, or left on disk after a load.
   */
  const LEFTOVER = 'left-behind-secret';

  test('loads without the key and is written back without it', () => {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify({
      apiKey: LEFTOVER,
      modelId: 'google/gemma-4-31b-it:free',
      fallbackEnabled: false,
    }));

    aiSettingsStore.reload();

    const settings = aiSettingsStore.get();
    expect(settings).toEqual({ modelId: 'google/gemma-4-31b-it:free', fallbackEnabled: false });
    expect(Object.keys(settings)).not.toContain('apiKey');

    // Erased where it was, not merely ignored.
    expect(stored().apiKey).toBeUndefined();
    expect(localStorage.getItem(AI_SETTINGS_STORAGE_KEY)).not.toContain(LEFTOVER);
  });

  test('a leftover key never reaches the logger, even when the rewrite fails', () => {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify({ apiKey: LEFTOVER }));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    aiSettingsStore.reload();

    const logged = warn.mock.calls.flat().map((item) => JSON.stringify(item)).join(' ');
    expect(logged).not.toContain(LEFTOVER);
    expect(aiSettingsStore.get()).toEqual(DEFAULT_AI_SETTINGS);

    warn.mockRestore();
    setItem.mockRestore();
  });
});

describe('useAiSettings', () => {
  test('re-renders on a change made anywhere', () => {
    const { result } = renderHook(() => useAiSettings());
    expect(result.current.fallbackEnabled).toBe(true);

    act(() => aiSettingsStore.setFallbackEnabled(false));
    expect(result.current.fallbackEnabled).toBe(false);
  });
});
