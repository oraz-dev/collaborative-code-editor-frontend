/**
 * What has already been suggested, so the same place is never asked twice.
 *
 * Two jobs, and the second is the one that matters. An exact repeat — the
 * caret moved away and came back, or an undo landed on the same spot — is
 * served from memory, which is worth a round trip. But the common case is
 * someone accepting a suggestion by typing it: the ghost text says
 * `.map((item) => item.id)` and they type `.m`, `.ma`, `.map`. Each keystroke
 * is a new prefix and would be a new request, each arriving a few hundred
 * milliseconds late, so the suggestion flickers away and back while they type
 * the very thing it offered. Serving the remainder from the last answer keeps
 * it still.
 */

/** Enough for the handful of spots a person moves between; it is only strings. */
export const COMPLETION_CACHE_SIZE = 24;

export interface CompletionCache {
  /** The completion for this exact site, or the tail of the last one still being typed. */
  get(prefix: string, suffix: string): string | null;
  set(prefix: string, suffix: string, completion: string): void;
  clear(): void;
  readonly size: number;
}

interface LastSuggestion {
  prefix: string;
  suffix: string;
  completion: string;
}

/** A separator no source file contains, so two keys cannot collide. */
const SEPARATOR = '\u0000';

function keyOf(prefix: string, suffix: string): string {
  return `${prefix}${SEPARATOR}${suffix}`;
}

export function createCompletionCache(limit: number = COMPLETION_CACHE_SIZE): CompletionCache {
  // Insertion order is the recency order: a hit is deleted and re-set, so the
  // first key is always the least recently used one.
  const entries = new Map<string, string>();
  let last: LastSuggestion | null = null;

  return {
    get size() {
      return entries.size;
    },

    get(prefix, suffix) {
      const key = keyOf(prefix, suffix);
      const hit = entries.get(key);
      if (hit !== undefined) {
        entries.delete(key);
        entries.set(key, hit);
        return hit;
      }

      if (!last || suffix !== last.suffix || !prefix.startsWith(last.prefix)) return null;

      // Exactly the characters the last suggestion offered, and no others: one
      // keystroke that disagrees with it means the suggestion is now wrong and
      // must be asked for again.
      const typed = prefix.slice(last.prefix.length);
      if (typed.length === 0 || !last.completion.startsWith(typed)) return null;

      const rest = last.completion.slice(typed.length);
      return rest.length > 0 ? rest : null;
    },

    set(prefix, suffix, completion) {
      if (completion.length === 0) return;

      const key = keyOf(prefix, suffix);
      entries.delete(key);
      entries.set(key, completion);
      if (entries.size > limit) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }

      last = { prefix, suffix, completion };
    },

    clear() {
      entries.clear();
      last = null;
    },
  };
}
