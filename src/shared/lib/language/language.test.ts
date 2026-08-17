import { describe, expect, test } from 'vitest';
import { languageFromFileName } from './language';

describe('languageFromFileName', () => {
  test('maps common source extensions', () => {
    expect(languageFromFileName('Editor.tsx')).toBe('typescript');
    expect(languageFromFileName('index.ts')).toBe('typescript');
    expect(languageFromFileName('main.py')).toBe('python');
    expect(languageFromFileName('styles.scss')).toBe('scss');
  });

  test('is case-insensitive', () => {
    expect(languageFromFileName('README.MD')).toBe('markdown');
  });

  test('falls back to plain text', () => {
    expect(languageFromFileName('Dockerfile')).toBe('plaintext');
    expect(languageFromFileName('notes.unknownext')).toBe('plaintext');
    expect(languageFromFileName('')).toBe('plaintext');
  });
});
