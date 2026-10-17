import { describe, expect, test } from 'vitest';
import { keywordsFor, searchEmoji, type EmojiKeywordIndex } from './searchEmoji';

const INDEX: EmojiKeywordIndex = {
  '😂': ['face_with_tears_of_joy', 'laugh', 'lol'],
  '😀': ['grinning_face', 'smile', 'happy'],
  '❤': ['red_heart', 'love'],
  '🐛': ['bug', 'insect'],
};

const CANDIDATES = [
  { emoji: '😀', category: 'Smileys & emotion' },
  { emoji: '😂', category: 'Smileys & emotion' },
  { emoji: '❤️', category: 'Symbols' },
  { emoji: '🐛', category: 'Animals & nature' },
  { emoji: '🐛', category: 'Dev & code' },
];

describe('searchEmoji', () => {
  test('finds by keyword, best match first', () => {
    expect(searchEmoji(INDEX, CANDIDATES, 'lol')).toEqual(['😂']);
    expect(searchEmoji(INDEX, CANDIDATES, 'face')).toEqual(['😀', '😂']);
  });

  test('ignores the variation selector when looking up keywords', () => {
    expect(keywordsFor(INDEX, '❤️')).toContain('love');
    expect(searchEmoji(INDEX, CANDIDATES, 'love')).toEqual(['❤️']);
  });

  test('matches the category name and lists each emoji once', () => {
    expect(searchEmoji(INDEX, CANDIDATES, 'bug')).toEqual(['🐛']);
    expect(searchEmoji(INDEX, CANDIDATES, 'symbols')).toEqual(['❤️']);
  });

  test('an empty query finds nothing', () => {
    expect(searchEmoji(INDEX, CANDIDATES, '  ')).toEqual([]);
  });
});
