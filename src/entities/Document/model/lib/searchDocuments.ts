import type { WorkspaceDocument } from '../types/document';

/** Subsequence match, so "idx" still finds "index.ts". */
function fuzzyScore(name: string, query: string): number | null {
  const haystack = name.toLowerCase();
  const needle = query.toLowerCase();

  const exact = haystack.indexOf(needle);
  if (exact === 0) return 0;
  if (exact > 0) return 1;

  let position = 0;
  let gaps = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, position);
    if (found === -1) return null;
    gaps += found - position;
    position = found + 1;
  }

  return 2 + gaps;
}

/**
 * Ranks documents by how well their name matches. Files sort above folders at
 * an equal score, since opening a file is the usual intent.
 */
export function searchDocuments(
  documents: WorkspaceDocument[],
  query: string,
  limit = 8,
): WorkspaceDocument[] {
  const trimmed = query.trim();

  if (!trimmed) {
    return [...documents]
      .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))
      .slice(0, limit);
  }

  const scored: Array<{ document: WorkspaceDocument; score: number }> = [];

  documents.forEach((document) => {
    const score = fuzzyScore(document.name, trimmed);
    if (score !== null) scored.push({ document, score });
  });

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.document.kind !== b.document.kind) return a.document.kind === 'file' ? -1 : 1;
      return a.document.name.localeCompare(b.document.name);
    })
    .slice(0, limit)
    .map((entry) => entry.document);
}

/** Removes repeats when the same document appears in more than one cached list. */
export function dedupeDocuments(documents: WorkspaceDocument[]): WorkspaceDocument[] {
  const seen = new Set<string>();
  const unique: WorkspaceDocument[] = [];

  documents.forEach((document) => {
    if (!document.id || seen.has(document.id)) return;
    seen.add(document.id);
    unique.push(document);
  });

  return unique;
}
