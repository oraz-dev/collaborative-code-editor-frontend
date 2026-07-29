import { describe, expect, test } from 'vitest';
import { mapDocuments } from '../types/document';
import { dedupeDocuments, searchDocuments } from './searchDocuments';

const documents = mapDocuments([
  { id: '1', docname: 'index.ts', doctype: 'file', updated_at: '2026-07-28T10:00:00Z' },
  { id: '2', docname: 'src', doctype: 'folder', updated_at: '2026-07-28T12:00:00Z' },
  { id: '3', docname: 'README.md', doctype: 'file', updated_at: '2026-07-28T11:00:00Z' },
  { id: '4', docname: 'indexer.go', doctype: 'file', updated_at: '2026-07-28T09:00:00Z' },
]);

describe('searchDocuments', () => {
  test('falls back to most recently updated when there is no query', () => {
    expect(searchDocuments(documents, '').map((d) => d.name))
      .toEqual(['src', 'README.md', 'index.ts', 'indexer.go']);
  });

  test('ranks a prefix match above a mid-string match', () => {
    const names = searchDocuments(documents, 'index').map((d) => d.name);
    expect(names[0]).toBe('index.ts');
    expect(names).toContain('indexer.go');
  });

  test('matches a subsequence so short abbreviations still find files', () => {
    expect(searchDocuments(documents, 'idx').map((d) => d.name)).toContain('index.ts');
  });

  test('is case-insensitive', () => {
    expect(searchDocuments(documents, 'readme').map((d) => d.name)).toContain('README.md');
  });

  test('returns nothing when there is no match at all', () => {
    expect(searchDocuments(documents, 'zzzzz')).toEqual([]);
  });

  test('respects the result limit', () => {
    expect(searchDocuments(documents, '', 2)).toHaveLength(2);
  });
});

describe('dedupeDocuments', () => {
  test('keeps one entry per id when lists overlap', () => {
    const duplicated = [...documents, ...documents];
    expect(dedupeDocuments(duplicated)).toHaveLength(documents.length);
  });

  test('drops entries with no id', () => {
    const withBlank = mapDocuments([{ docname: 'ghost', doctype: 'file' }]);
    expect(dedupeDocuments(withBlank)).toHaveLength(0);
  });
});
