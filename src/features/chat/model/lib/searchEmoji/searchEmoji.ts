import { logger } from '@/shared/lib/logger/logger';

/** Emoji → keywords, as emojilib ships it. */
export type EmojiKeywordIndex = Record<string, readonly string[]>;

const VARIATION_SELECTOR = /️/g;

let indexPromise: Promise<EmojiKeywordIndex> | null = null;

/**
 * emojilib is ~250 KB of keywords, so it is fetched the first time someone
 * searches rather than shipped with the editor.
 */
export function loadEmojiKeywords(): Promise<EmojiKeywordIndex> {
  if (!indexPromise) {
    indexPromise = import('emojilib')
      .then((mod) => (mod.default ?? mod) as unknown as EmojiKeywordIndex)
      .catch((error: unknown) => {
        logger.warn('Could not load emoji keywords', error);
        indexPromise = null;
        return {};
      });
  }
  return indexPromise;
}

export function keywordsFor(index: EmojiKeywordIndex, emoji: string): readonly string[] {
  return index[emoji] ?? index[emoji.replace(VARIATION_SELECTOR, '')] ?? [];
}

/**
 * Emoji whose keywords (or category name) contain every word of the query,
 * best matches first: a keyword that starts with the query beats one that
 * merely contains it.
 */
export function searchEmoji(
  index: EmojiKeywordIndex,
  candidates: readonly { emoji: string; category: string }[],
  query: string,
): string[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const seen = new Set<string>();
  const scored: { emoji: string; score: number; order: number }[] = [];

  candidates.forEach(({ emoji, category }, order) => {
    if (seen.has(emoji)) return;
    const haystack = [...keywordsFor(index, emoji).map((k) => k.replace(/_/g, ' ').toLowerCase()), category.toLowerCase()];
    let score = 0;
    const matchesAll = words.every((word) => {
      if (haystack.some((k) => k === word)) { score += 3; return true; }
      if (haystack.some((k) => k.startsWith(word) || k.split(' ').some((part) => part.startsWith(word)))) { score += 2; return true; }
      if (haystack.some((k) => k.includes(word))) { score += 1; return true; }
      return false;
    });
    if (matchesAll) {
      seen.add(emoji);
      scored.push({ emoji, score, order });
    }
  });

  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((entry) => entry.emoji);
}
