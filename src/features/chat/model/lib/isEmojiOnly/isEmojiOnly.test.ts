import { describe, expect, test } from 'vitest';
import { isEmojiOnly } from './isEmojiOnly';

describe('isEmojiOnly', () => {
  test.each(['🔥', '👍👍', '❤️', '🇹🇲', '🧑‍💻', '👋🏽', ' 😂 😂 '])('%s is emoji only', (body) => {
    expect(isEmojiOnly(body)).toBe(true);
  });

  test.each(['hi 👋', 'ok', '123', '#', '', '   ', '😀😀😀😀😀😀'])('%s is not', (body) => {
    expect(isEmojiOnly(body)).toBe(false);
  });
});
