import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  COMPLETE_SETTINGS_STORAGE_KEY,
  completeSettingsStore,
  DEFAULT_COMPLETE_SETTINGS,
} from './completeSettings';

function seed(value: unknown): void {
  localStorage.setItem(COMPLETE_SETTINGS_STORAGE_KEY, JSON.stringify(value));
  completeSettingsStore.reload();
}

beforeEach(() => {
  localStorage.clear();
  completeSettingsStore.reload();
});

describe('defaults', () => {
  test('on demand, because it is the backend that works today', () => {
    expect(DEFAULT_COMPLETE_SETTINGS).toEqual({ mode: 'onDemand', singleLine: true });
    expect(completeSettingsStore.get()).toEqual(DEFAULT_COMPLETE_SETTINGS);
  });
});

describe('writing', () => {
  test('a mode is kept and persisted', () => {
    completeSettingsStore.setMode('asYouType');

    expect(completeSettingsStore.get().mode).toBe('asYouType');
    expect(JSON.parse(localStorage.getItem(COMPLETE_SETTINGS_STORAGE_KEY) as string))
      .toEqual({ mode: 'asYouType', singleLine: true });
  });

  test('as-you-type can be chosen even though the fast backend has no key', () => {
    // The store knows nothing about backends: refusing the choice here is what
    // would make the setting a lie. Being inactive is reported, not prevented.
    completeSettingsStore.setMode('asYouType');
    expect(completeSettingsStore.get().mode).toBe('asYouType');
  });

  test('single line is kept', () => {
    completeSettingsStore.setSingleLine(false);
    expect(completeSettingsStore.get().singleLine).toBe(false);
  });

  test('subscribers are told once per change', () => {
    const listener = vi.fn();
    const unsubscribe = completeSettingsStore.subscribe(listener);

    completeSettingsStore.setMode('off');
    completeSettingsStore.setSingleLine(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    completeSettingsStore.setMode('onDemand');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('reset goes back to the defaults', () => {
    completeSettingsStore.setMode('off');
    completeSettingsStore.setSingleLine(false);
    completeSettingsStore.reset();

    expect(completeSettingsStore.get()).toEqual(DEFAULT_COMPLETE_SETTINGS);
  });
});

describe('reading a storage entry that cannot be trusted', () => {
  test('a mode this app does not have becomes the default', () => {
    seed({ mode: 'telepathy', singleLine: true });
    expect(completeSettingsStore.get().mode).toBe('onDemand');
  });

  test('a missing single line defaults to on', () => {
    seed({ mode: 'off' });
    expect(completeSettingsStore.get()).toEqual({ mode: 'off', singleLine: true });
  });

  test('corrupt JSON falls back to the defaults instead of throwing', () => {
    localStorage.setItem(COMPLETE_SETTINGS_STORAGE_KEY, '{not json');
    expect(() => completeSettingsStore.reload()).not.toThrow();
    expect(completeSettingsStore.get()).toEqual(DEFAULT_COMPLETE_SETTINGS);
  });

  test('a stored value that is not an object falls back too', () => {
    seed('asYouType');
    expect(completeSettingsStore.get()).toEqual(DEFAULT_COMPLETE_SETTINGS);
  });
});

describe('storage that refuses to be written', () => {
  test('costs the setting on disk, never the session', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => completeSettingsStore.setMode('off')).not.toThrow();
    // Still in memory for this tab, which is what the editor reads.
    expect(completeSettingsStore.get().mode).toBe('off');

    setItem.mockRestore();
  });
});
