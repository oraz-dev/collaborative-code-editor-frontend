import { describe, expect, test } from 'vitest';
import { formatBytes, validateChatMedia } from './validateChatMedia';

function file(name: string, type: string, size: number): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateChatMedia', () => {
  test('accepts photos and videos within their limits', () => {
    const { accepted, rejected } = validateChatMedia(
      [file('a.png', 'image/png', 1000), file('b.mov', 'video/quicktime', 50 * 1024 * 1024)],
      10,
    );
    expect(accepted.map((entry) => entry.kind)).toEqual(['image', 'video']);
    expect(rejected).toEqual([]);
  });

  test('guesses the type from the extension when the browser gives none', () => {
    expect(validateChatMedia([file('clip.webm', '', 10)], 10).accepted[0].kind).toBe('video');
  });

  test('turns away other types and oversized files with a reason', () => {
    const { accepted, rejected } = validateChatMedia(
      [file('notes.pdf', 'application/pdf', 10), file('huge.jpg', 'image/jpeg', 25 * 1024 * 1024)],
      10,
    );
    expect(accepted).toEqual([]);
    expect(rejected[0]).toContain('“notes.pdf” can’t be sent');
    expect(rejected[1]).toBe('“huge.jpg” is 25 MB. Photos can be up to 20 MB.');
  });

  test('keeps to the room left in the message', () => {
    const { accepted, rejected } = validateChatMedia(
      [file('1.png', 'image/png', 1), file('2.png', 'image/png', 1), file('3.png', 'image/png', 1)],
      1,
    );
    expect(accepted).toHaveLength(1);
    expect(rejected[0]).toContain('2 were left out');
  });
});

describe('formatBytes', () => {
  test('reads naturally', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(48213)).toBe('47 KB');
    expect(formatBytes(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });
});
