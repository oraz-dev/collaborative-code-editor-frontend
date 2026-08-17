import { describe, expect, test } from 'vitest';
import { mapDocument, mapDocuments, sortDocuments, toDocumentKind } from './document';

describe('mapDocument', () => {
  test('translates the response field names', () => {
    // responses use docname/doctype; requests use doc_name/doc_type
    const mapped = mapDocument({
      id: 'doc-1',
      owner_id: 'user-1',
      parent_id: 'folder-1',
      docname: 'index.ts',
      doctype: 'file',
      content: 'const x = 1',
      created_at: '2026-07-28T16:41:52Z',
      updated_at: '2026-07-28T16:44:48Z',
    });

    expect(mapped).toEqual({
      id: 'doc-1',
      ownerId: 'user-1',
      parentId: 'folder-1',
      name: 'index.ts',
      kind: 'file',
      content: 'const x = 1',
      createdAt: '2026-07-28T16:41:52Z',
      updatedAt: '2026-07-28T16:44:48Z',
    });
  });

  test('treats a missing parent as a root', () => {
    expect(mapDocument({ id: 'a', docname: 'src', doctype: 'folder' }).parentId).toBeNull();
  });

  test('discards the zero-value timestamps the create response returns', () => {
    const mapped = mapDocument({
      id: 'a',
      docname: 'new.ts',
      doctype: 'file',
      created_at: '0001-01-01T00:00:00Z',
      updated_at: '0001-01-01T00:00:00Z',
    });

    expect(mapped.createdAt).toBeNull();
    expect(mapped.updatedAt).toBeNull();
  });

  test('falls back to sane defaults for a sparse payload', () => {
    const mapped = mapDocument({});
    expect(mapped.name).toBe('Untitled');
    expect(mapped.kind).toBe('file');
    expect(mapped.content).toBe('');
  });
});

describe('mapDocuments', () => {
  test('tolerates a null list', () => {
    expect(mapDocuments(null)).toEqual([]);
    expect(mapDocuments(undefined)).toEqual([]);
  });
});

describe('toDocumentKind', () => {
  test('only recognises folder, everything else is a file', () => {
    expect(toDocumentKind('folder')).toBe('folder');
    expect(toDocumentKind('file')).toBe('file');
    expect(toDocumentKind('banana')).toBe('file');
    expect(toDocumentKind(undefined)).toBe('file');
  });
});

describe('sortDocuments', () => {
  test('puts folders first, then sorts alphabetically', () => {
    const documents = mapDocuments([
      { id: '1', docname: 'z.ts', doctype: 'file' },
      { id: '2', docname: 'src', doctype: 'folder' },
      { id: '3', docname: 'a.ts', doctype: 'file' },
      { id: '4', docname: 'lib', doctype: 'folder' },
    ]);

    expect(sortDocuments(documents).map((d) => d.name)).toEqual(['lib', 'src', 'a.ts', 'z.ts']);
  });

  test('does not mutate the input', () => {
    const documents = mapDocuments([
      { id: '1', docname: 'z.ts', doctype: 'file' },
      { id: '2', docname: 'src', doctype: 'folder' },
    ]);
    const original = [...documents];
    sortDocuments(documents);
    expect(documents).toEqual(original);
  });
});
