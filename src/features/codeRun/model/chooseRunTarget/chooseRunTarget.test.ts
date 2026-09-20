import { describe, expect, test } from 'vitest';
import { chooseRunTarget, whyNotRunnable } from './chooseRunTarget';

const PYTHON = { id: 71, name: 'Python (3.8.1)' };
const NODE = { id: 63, name: 'JavaScript (Node.js 12.14.0)' };

describe('chooseRunTarget', () => {
  test('the browser wins whenever it can open the file', () => {
    // A .js file exists on both sides. Sending it to Judge0 would turn a
    // rendered page into a blank stdout dump.
    expect(chooseRunTarget({ previewable: true, language: NODE })).toEqual({
      engine: 'preview',
      language: null,
    });
  });

  test('the sandbox takes what the browser cannot open', () => {
    expect(chooseRunTarget({ previewable: false, language: PYTHON })).toEqual({
      engine: 'sandbox',
      language: PYTHON,
    });
  });

  test('still previews when the sandbox has no language at all', () => {
    // An offline or unconfigured sandbox must not cost the browser preview.
    expect(chooseRunTarget({ previewable: true, language: null })?.engine).toBe('preview');
  });

  test('nothing can run a file neither side handles', () => {
    expect(chooseRunTarget({ previewable: false, language: null })).toBeNull();
  });
});

describe('whyNotRunnable', () => {
  test('says nothing when the file can run', () => {
    expect(whyNotRunnable('main.py', { engine: 'sandbox', language: PYTHON })).toBeNull();
  });

  test('names the file and both engines when it cannot', () => {
    const reason = whyNotRunnable('notes.md', null);

    expect(reason).toContain('notes.md');
    expect(reason).toMatch(/preview/i);
    expect(reason).toMatch(/sandbox/i);
  });
});
