import { describe, expect, test } from 'vitest';
import {
  cleanCompletion,
  completionContext,
  completionMessages,
  MAX_COMPLETION_CHARS,
  PREFIX_LIMIT,
  SUFFIX_LIMIT,
} from './completionPrompt';

/** True when a lone half of a surrogate pair survived a slice. */
function hasLoneSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('completionContext', () => {
  test('keeps the window small on both sides of the cursor', () => {
    const text = `${'a'.repeat(5000)}|${'b'.repeat(5000)}`;
    const context = completionContext({ text, offset: 5000, filePath: 'src/App.tsx' });

    expect(context.textBeforeCursor).toHaveLength(PREFIX_LIMIT);
    expect(context.textAfterCursor).toHaveLength(SUFFIX_LIMIT);
    expect(context.textAfterCursor.startsWith('|')).toBe(true);
  });

  test('reads the language from the file path', () => {
    expect(completionContext({ text: '', offset: 0, filePath: 'src/App.tsx' }).language).toBe('typescript');
    expect(completionContext({ text: '', offset: 0, filePath: 'a/b/styles.css' }).language).toBe('css');
  });

  test('takes the whole document when it is smaller than the window', () => {
    const context = completionContext({ text: 'const a = 1;', offset: 9, filePath: 'a.ts' });

    expect(context.textBeforeCursor).toBe('const a =');
    expect(context.textAfterCursor).toBe(' 1;');
  });

  test('clamps an offset past either end', () => {
    const past = completionContext({ text: 'abc', offset: 99, filePath: 'a.ts' });
    expect(past.textBeforeCursor).toBe('abc');
    expect(past.textAfterCursor).toBe('');

    const before = completionContext({ text: 'abc', offset: -5, filePath: 'a.ts' });
    expect(before.textBeforeCursor).toBe('');
    expect(before.textAfterCursor).toBe('abc');
  });

  test('never splits a surrogate pair at the start of the prefix window', () => {
    // The emoji's low half sits exactly on the `cursor - PREFIX_LIMIT` boundary.
    const text = `${'x'.repeat(10)}😀${'y'.repeat(2000)}`;
    const context = completionContext({ text, offset: 11 + PREFIX_LIMIT, filePath: 'a.ts' });

    expect(hasLoneSurrogate(context.textBeforeCursor)).toBe(false);
    expect(context.textBeforeCursor).toBe('y'.repeat(PREFIX_LIMIT - 1));
  });

  test('never splits a surrogate pair at the end of the suffix window', () => {
    const text = `${'b'.repeat(SUFFIX_LIMIT - 1)}😀${'c'.repeat(10)}`;
    const context = completionContext({ text, offset: 0, filePath: 'a.ts' });

    expect(hasLoneSurrogate(context.textAfterCursor)).toBe(false);
    expect(context.textAfterCursor).toBe('b'.repeat(SUFFIX_LIMIT - 1));
  });

  test('a cursor inside a pair is snapped back so the character stays whole', () => {
    const context = completionContext({ text: 'ab😀cd', offset: 3, filePath: 'a.ts' });

    expect(context.textBeforeCursor).toBe('ab');
    expect(context.textAfterCursor).toBe('😀cd');
  });
});

describe('completionMessages', () => {
  const messages = completionMessages(completionContext({
    text: 'const sum = (a: number, b: number) => a + b;',
    offset: 12,
    filePath: 'src/lib/sum.ts',
  }));

  test('sends a system message that forbids prose, fences and repetition', () => {
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toMatch(/code completion engine/i);
    expect(messages[0].content).toMatch(/no prose/i);
    expect(messages[0].content).toMatch(/fence/i);
    expect(messages[0].content).toMatch(/never repeat/i);
  });

  test('sends a user message carrying the path, the language and both halves, delimited', () => {
    const user = messages[1].content;

    expect(messages[1].role).toBe('user');
    expect(user).toContain('File: src/lib/sum.ts');
    expect(user).toContain('Language: typescript');
    expect(user).toContain('<before_cursor>\nconst sum = \n</before_cursor>');
    expect(user).toContain('<after_cursor>\n(a: number, b: number) => a + b;\n</after_cursor>');
  });

  test('is exactly two messages', () => {
    expect(messages).toHaveLength(2);
  });
});

describe('cleanCompletion', () => {
  const plain = { textAfterCursor: '' };

  test('an empty or missing answer is nothing', () => {
    expect(cleanCompletion('', plain)).toBe('');
    expect(cleanCompletion(undefined as unknown as string, plain)).toBe('');
  });

  test('takes the code out of a fenced block and drops the prose around it', () => {
    const raw = 'Here is the completion:\n```ts\nconst a = 1;\n```\nThis assigns one.';
    expect(cleanCompletion(raw, plain)).toBe('const a = 1;');
  });

  test('handles a fence the model never closed', () => {
    expect(cleanCompletion('```js\nreturn a + b;', plain)).toBe('return a + b;');
  });

  test('drops a leading greeting and a trailing explanation without a fence', () => {
    expect(cleanCompletion('Sure! Here you go\nreturn a + b;', plain)).toBe('return a + b;');
    expect(cleanCompletion('return a + b;\nThis adds them.', plain)).toBe('return a + b;');
  });

  test('keeps indentation on the first line but drops a leading blank line', () => {
    expect(cleanCompletion('\n    return a;', plain)).toBe('    return a;');
  });

  test('drops a completion that only restates what follows the cursor', () => {
    expect(cleanCompletion('}', { textAfterCursor: '}\n' })).toBe('');
    expect(cleanCompletion(' b);', { textAfterCursor: ' b);\nconst next = 2;' })).toBe('');
  });

  test('keeps a completion that merely starts like the text after it', () => {
    expect(cleanCompletion('a + b);', { textAfterCursor: 'a' })).toBe('a + b);');
  });

  test('cuts at the first newline in single-line mode', () => {
    expect(cleanCompletion('a + b;\nreturn c;', { ...plain, singleLine: true })).toBe('a + b;');
    expect(cleanCompletion('a + b;\nreturn c;', { ...plain, singleLine: false })).toBe('a + b;\nreturn c;');
  });

  test('collapses a whitespace-only completion to nothing', () => {
    expect(cleanCompletion('   \n\t  ', plain)).toBe('');
    expect(cleanCompletion('\n\n', plain)).toBe('');
  });

  test('caps the length', () => {
    expect(cleanCompletion('x'.repeat(MAX_COMPLETION_CHARS + 200), plain)).toHaveLength(MAX_COMPLETION_CHARS);
  });

  test('trims trailing whitespace', () => {
    expect(cleanCompletion('const a = 1;   \n\n', plain)).toBe('const a = 1;');
  });
});
