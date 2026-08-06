import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PREFERENCES_STORAGE_KEY, preferencesStore } from './preferencesStore';
import { DEFAULT_PREFERENCES } from './types/preferences';

describe('preferencesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    preferencesStore.reload();
  });

  test('starts from the defaults with nothing stored', () => {
    expect(preferencesStore.get()).toEqual(DEFAULT_PREFERENCES);
  });

  test('persists a change to localStorage', () => {
    preferencesStore.setAppearance({ theme: 'light' });

    expect(preferencesStore.get().appearance.theme).toBe('light');
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}');
    expect(stored.appearance.theme).toBe('light');
  });

  test('reloads what was written, so the choice survives a refresh', () => {
    preferencesStore.setEditor({ fontSize: 20 });
    preferencesStore.reload();

    expect(preferencesStore.get().editor.fontSize).toBe(20);
  });

  test('leaves the other groups untouched when one changes', () => {
    preferencesStore.setEditor({ fontSize: 18 });
    preferencesStore.setAppearance({ accent: 'coral' });

    expect(preferencesStore.get().editor.fontSize).toBe(18);
    expect(preferencesStore.get().appearance.accent).toBe('coral');
  });

  test('notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = preferencesStore.subscribe(listener);

    preferencesStore.setCollaboration({ liveCursors: false });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    preferencesStore.setCollaboration({ liveCursors: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('falls back to defaults when the stored value is corrupt', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, 'not json{');
    preferencesStore.reload();

    expect(preferencesStore.get()).toEqual(DEFAULT_PREFERENCES);
  });

  test('sanitises a stored value that is out of range', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ editor: { fontSize: 900 } }));
    preferencesStore.reload();

    expect(preferencesStore.get().editor.fontSize).toBe(24);
  });

  test('keeps working when localStorage refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    // The setting should still apply for this session.
    expect(() => preferencesStore.setAppearance({ theme: 'light' })).not.toThrow();
    expect(preferencesStore.get().appearance.theme).toBe('light');

    setItem.mockRestore();
  });

  test('reset returns everything to defaults', () => {
    preferencesStore.setAppearance({ theme: 'light', accent: 'coral' });
    preferencesStore.reset();

    expect(preferencesStore.get()).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('layout preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    preferencesStore.reload();
  });

  test('remembers a pane size across a reload', () => {
    preferencesStore.setLayout({ treeWidth: 320 });
    preferencesStore.reload();

    expect(preferencesStore.get().layout.treeWidth).toBe(320);
  });

  test('clamps a stored size that would make a pane unusable', () => {
    localStorage.setItem(
      'space:preferences',
      JSON.stringify({ layout: { treeWidth: 10, previewWidth: 9999, consoleHeight: 0 } }),
    );
    preferencesStore.reload();

    const { layout } = preferencesStore.get();
    expect(layout.treeWidth).toBe(180);
    expect(layout.previewWidth).toBe(900);
    expect(layout.consoleHeight).toBe(80);
  });

  test('resizing one pane leaves the others alone', () => {
    preferencesStore.setLayout({ previewWidth: 520 });

    const { layout } = preferencesStore.get();
    expect(layout.previewWidth).toBe(520);
    expect(layout.treeWidth).toBe(240);
    expect(layout.consoleHeight).toBe(160);
  });
});
