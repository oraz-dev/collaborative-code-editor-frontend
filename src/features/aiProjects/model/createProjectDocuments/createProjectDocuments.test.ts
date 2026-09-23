import { describe, expect, test, vi } from 'vitest';
import type { CreateDocumentInput, WorkspaceDocument } from '@/entities/Document';
import type { ProjectFile } from '../streamJson/streamJson';
import {
  createProjectDocuments,
  folderPaths,
  isProjectCreationError,
  uniqueName,
  type CreateProjectProgress,
} from './createProjectDocuments';

const FILES: ProjectFile[] = [
  { path: 'index.html', content: '<div id="root"></div><script type="module" src="/src/main.tsx"></script>' },
  { path: 'package.json', content: '{}' },
  { path: 'src/main.tsx', content: 'export const main = 1;' },
  { path: 'src/components/Card.tsx', content: 'export const Card = () => null;' },
  { path: 'src/components/Badge.tsx', content: 'export const Badge = () => null;' },
];

/** A stand-in document service: hands back ids and records every call. */
function fakeService(failOn?: string) {
  const calls: CreateDocumentInput[] = [];
  let count = 0;

  const createDocument = async (input: CreateDocumentInput): Promise<WorkspaceDocument> => {
    calls.push(input);
    if (failOn && input.name === failOn) throw new Error('service said no');
    count += 1;
    return {
      id: `doc-${count}`,
      ownerId: input.ownerId,
      parentId: input.parentId ?? null,
      name: input.name,
      kind: input.kind,
      content: input.content ?? '',
      createdAt: null,
      updatedAt: null,
    };
  };

  return { calls, createDocument };
}

function run(overrides: Partial<Parameters<typeof createProjectDocuments>[0]> = {}) {
  const service = fakeService();
  return {
    service,
    result: createProjectDocuments({
      rootName: 'bare app',
      files: FILES,
      ownerId: 'user-1',
      createDocument: service.createDocument,
      ...overrides,
    }),
  };
}

describe('folderPaths', () => {
  test('lists every implied folder once, parents first', () => {
    expect(folderPaths(FILES)).toEqual(['src', 'src/components']);
  });

  test('is empty for a flat project', () => {
    expect(folderPaths([{ path: 'index.html', content: '' }])).toEqual([]);
  });
});

describe('uniqueName', () => {
  test.each([
    [[], 'app'],
    [['app'], 'app-2'],
    [['app', 'app-2'], 'app-3'],
    [['APP'], 'app-2'],
  ])('with %j taken, picks %s', (taken, expected) => {
    expect(uniqueName('app', taken)).toBe(expected);
  });

  test('never produces an empty or slashed folder name', () => {
    expect(uniqueName('   ', [])).toBe('ai-project');
    expect(uniqueName('a/b', [])).toBe('a-b');
  });
});

describe('createProjectDocuments', () => {
  test('creates the root, then folders parents-first, then files', async () => {
    const { service, result } = run();
    const { rootId, created, entryId } = await result;

    expect(service.calls.map((call) => call.name)).toEqual([
      'bare app', 'src', 'components', 'index.html', 'package.json', 'main.tsx', 'Card.tsx', 'Badge.tsx',
    ]);
    expect(rootId).toBe('doc-1');
    expect(created).toHaveLength(8);
    // The entry is index.html: it loads one of the project's own modules.
    expect(entryId).toBe(created.find((item) => item.path === 'index.html')?.id);
  });

  test('gives every document the right parent', async () => {
    const { service, result } = run();
    await result;

    const byName = new Map(service.calls.map((call) => [call.name, call]));
    expect(byName.get('src')?.parentId).toBe('doc-1');
    expect(byName.get('components')?.parentId).toBe('doc-2');
    expect(byName.get('Card.tsx')?.parentId).toBe('doc-3');
    // A root-level file belongs to the project folder, not to the workspace.
    expect(byName.get('index.html')?.parentId).toBe('doc-1');
    expect(byName.get('bare app')?.parentId).toBeUndefined();
  });

  test('sends file content and creates folders without any', async () => {
    const { service, result } = run();
    await result;

    expect(service.calls.find((call) => call.name === 'main.tsx')?.content).toBe('export const main = 1;');
    expect(service.calls.find((call) => call.name === 'src')?.content).toBeUndefined();
    expect(service.calls.every((call) => call.ownerId === 'user-1')).toBe(true);
  });

  test('renames the project folder when the workspace already has that name', async () => {
    const { service, result } = run({ rootName: 'bare app', existingNames: ['Bare App', 'notes'] });
    const { rootName } = await result;

    expect(rootName).toBe('bare app-2');
    expect(service.calls[0].name).toBe('bare app-2');
  });

  test('reports progress for every document, in order', async () => {
    const seen: CreateProjectProgress[] = [];
    const { result } = run({ onProgress: (progress) => seen.push(progress) });
    await result;

    expect(seen).toHaveLength(8);
    expect(seen[0]).toEqual({ done: 1, total: 8, path: '', kind: 'folder' });
    expect(seen.at(-1)).toEqual({ done: 8, total: 8, path: 'src/components/Badge.tsx', kind: 'file' });
  });

  test('a service failure carries back what was already created', async () => {
    const service = fakeService('Card.tsx');

    const failure = await createProjectDocuments({
      rootName: 'app',
      files: FILES,
      ownerId: 'user-1',
      createDocument: service.createDocument,
    }).catch((error: unknown) => error);

    expect(isProjectCreationError(failure)).toBe(true);
    if (!isProjectCreationError(failure)) return;

    expect(failure.cancelled).toBe(false);
    expect(failure.path).toBe('src/components/Card.tsx');
    expect(failure.rootId).toBe('doc-1');
    expect(failure.created.map((item) => item.path)).toEqual([
      '', 'src', 'src/components', 'index.html', 'package.json', 'src/main.tsx',
    ]);
    expect(failure.message).toMatch(/service said no/);
    // Nothing was attempted after the failure.
    expect(service.calls.some((call) => call.name === 'Badge.tsx')).toBe(false);
  });

  test('an abort stops at the next document and says what exists', async () => {
    const controller = new AbortController();
    const service = fakeService();
    const onProgress = vi.fn((progress: CreateProjectProgress) => {
      if (progress.path === 'src') controller.abort();
    });

    const failure = await createProjectDocuments({
      rootName: 'app',
      files: FILES,
      ownerId: 'user-1',
      createDocument: service.createDocument,
      onProgress,
      signal: controller.signal,
    }).catch((error: unknown) => error);

    expect(isProjectCreationError(failure)).toBe(true);
    if (!isProjectCreationError(failure)) return;

    expect(failure.cancelled).toBe(true);
    expect(failure.created.map((item) => item.path)).toEqual(['', 'src']);
    expect(service.calls).toHaveLength(2);
  });

  test('an already-aborted signal creates nothing at all', async () => {
    const service = fakeService();

    const failure = await createProjectDocuments({
      rootName: 'app',
      files: FILES,
      ownerId: 'user-1',
      createDocument: service.createDocument,
      signal: AbortSignal.abort(),
    }).catch((error: unknown) => error);

    expect(isProjectCreationError(failure) && failure.cancelled).toBe(true);
    expect(service.calls).toEqual([]);
  });

  test('a path the model wrote with a leading or doubled slash stays inside the project', async () => {
    const service = fakeService();
    const { created, entryId } = await createProjectDocuments({
      rootName: 'app',
      files: [
        { path: 'index.html', content: '<script type="module" src="/src/main.tsx"></script>' },
        { path: '/src/main.tsx', content: 'export const main = 1;' },
        { path: 'src//components/Card.tsx', content: 'export const Card = () => null;' },
      ],
      ownerId: 'user-1',
      createDocument: service.createDocument,
    });

    // Every document has a parent: nothing landed at the workspace root beside
    // the user's own projects.
    expect(service.calls.filter((call) => call.parentId === undefined)).toHaveLength(1);
    expect(service.calls.find((call) => call.name === 'main.tsx')?.parentId).toBe('doc-2');
    expect(service.calls.find((call) => call.name === 'Card.tsx')?.parentId).toBe('doc-3');
    expect(created.map((item) => item.path)).toEqual([
      '', 'src', 'src/components', 'index.html', 'src/main.tsx', 'src/components/Card.tsx',
    ]);
    expect(entryId).toBe('doc-4');
  });

  test('a retry finishes the project it started instead of making a second one', async () => {
    const failing = fakeService('Card.tsx');
    const failure = await createProjectDocuments({
      rootName: 'app',
      files: FILES,
      ownerId: 'user-1',
      createDocument: failing.createDocument,
      existingNames: ['app'],
    }).catch((error: unknown) => error);

    expect(isProjectCreationError(failure)).toBe(true);
    if (!isProjectCreationError(failure)) return;
    expect(failure.rootName).toBe('app-2');

    const retry = fakeService();
    const result = await createProjectDocuments({
      rootName: failure.rootName,
      files: FILES,
      ownerId: 'user-1',
      createDocument: retry.createDocument,
      existingNames: ['app', 'app-2'],
      resume: failure.created,
    });

    // Only the two that were never created, and no second project folder.
    expect(retry.calls.map((call) => call.name)).toEqual(['Card.tsx', 'Badge.tsx']);
    expect(result.rootName).toBe('app-2');
    expect(result.rootId).toBe(failure.rootId);
    expect(result.created).toHaveLength(8);
    expect(result.entryId).toBe(failure.created.find((item) => item.path === 'index.html')?.id);
  });

  test('a project with no recognisable entry still creates, with nothing to open', async () => {
    const { result } = run({ files: [{ path: 'notes.md', content: '# hi' }] });
    const { entryId, created } = await result;

    expect(entryId).toBeNull();
    expect(created.map((item) => item.path)).toEqual(['', 'notes.md']);
  });
});
