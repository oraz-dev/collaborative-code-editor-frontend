/**
 * Up to two letters for an avatar. Names arrive from the server half-resolved —
 * empty strings, stray double spaces, a bare username — so the words are
 * filtered before indexing rather than trusting whatever showed up.
 */
export function initials(name: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';

  // A single word gives up its first two letters, so "orr" reads as "OR"
  // rather than a lone character floating in the circle.
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
