import 'fake-indexeddb/auto';
import { loadLocalDoc, saveLocalDoc, type LocalDocRecord } from './localDocStore';

function record(bytes: number[], over: Partial<LocalDocRecord> = {}): LocalDocRecord {
  return { state: Uint8Array.from(bytes), dirty: false, updatedAt: 1, ...over };
}

describe('localDocStore', () => {
  test('has nothing for a document it was never given', async () => {
    await expect(loadLocalDoc('user-1', 'never-saved')).resolves.toBeNull();
  });

  test('hands back what was saved, bytes and flags intact', async () => {
    await saveLocalDoc('user-1', 'doc-a', record([1, 2, 255], {
      dirty: true,
      access: { role: 'editor', canEdit: true },
    }));

    const loaded = await loadLocalDoc('user-1', 'doc-a');
    expect(Array.from(loaded?.state ?? [])).toEqual([1, 2, 255]);
    expect(loaded?.dirty).toBe(true);
    expect(loaded?.access).toEqual({ role: 'editor', canEdit: true });
  });

  test('a later save replaces the earlier one', async () => {
    await saveLocalDoc('user-1', 'doc-b', record([1], { dirty: true }));
    await saveLocalDoc('user-1', 'doc-b', record([2]));

    const loaded = await loadLocalDoc('user-1', 'doc-b');
    expect(Array.from(loaded?.state ?? [])).toEqual([2]);
    expect(loaded?.dirty).toBe(false);
  });

  test('keeps one person\'s copy away from the next person to sign in', async () => {
    await saveLocalDoc('user-1', 'doc-c', record([7], { dirty: true }));

    await expect(loadLocalDoc('user-2', 'doc-c')).resolves.toBeNull();
  });

  test('does nothing, quietly, where there is no IndexedDB', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error — simulating a browser without the API
    delete globalThis.indexedDB;
    try {
      await expect(saveLocalDoc('user-1', 'doc-d', record([1]))).resolves.toBeUndefined();
      await expect(loadLocalDoc('user-1', 'doc-d')).resolves.toBeNull();
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
