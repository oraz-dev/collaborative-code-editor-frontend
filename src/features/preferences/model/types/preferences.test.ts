import { describe, expect, test } from 'vitest';
import { DEFAULT_PREFERENCES, normalisePreferences } from './preferences';

describe('normalisePreferences', () => {
  test('returns defaults for empty or missing input', () => {
    expect(normalisePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(normalisePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(normalisePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  test('keeps values it recognises', () => {
    const result = normalisePreferences({
      appearance: { theme: 'light', accent: 'mint' },
      editor: { fontSize: 18, tabSize: 4, wordWrap: true, minimap: true, ligatures: false, fontFamily: 'fira' },
      collaboration: { liveCursors: false, cursorLabels: false },
    });

    expect(result.appearance).toEqual({ theme: 'light', accent: 'mint' });
    expect(result.editor.fontSize).toBe(18);
    expect(result.editor.fontFamily).toBe('fira');
    expect(result.collaboration).toEqual({ liveCursors: false, cursorLabels: false });
  });

  test('rejects an unknown theme or accent rather than applying it', () => {
    const result = normalisePreferences({ appearance: { theme: 'neon', accent: 'chartreuse' } });
    expect(result.appearance).toEqual(DEFAULT_PREFERENCES.appearance);
  });

  test('clamps font and tab size into a usable range', () => {
    // Stored preferences are hand-editable, so a nonsense value must not make
    // the editor unusable.
    expect(normalisePreferences({ editor: { fontSize: 0 } }).editor.fontSize).toBe(10);
    expect(normalisePreferences({ editor: { fontSize: 999 } }).editor.fontSize).toBe(24);
    expect(normalisePreferences({ editor: { tabSize: 0 } }).editor.tabSize).toBe(1);
    expect(normalisePreferences({ editor: { tabSize: 40 } }).editor.tabSize).toBe(8);
  });

  test('falls back when a number is not a number', () => {
    expect(normalisePreferences({ editor: { fontSize: 'big' } }).editor.fontSize)
      .toBe(DEFAULT_PREFERENCES.editor.fontSize);
  });

  test('rounds a fractional size', () => {
    expect(normalisePreferences({ editor: { fontSize: 14.6 } }).editor.fontSize).toBe(15);
  });

  test('ignores non-boolean toggles', () => {
    expect(normalisePreferences({ editor: { minimap: 'yes' } }).editor.minimap)
      .toBe(DEFAULT_PREFERENCES.editor.minimap);
  });
});
