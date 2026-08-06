import { readSeenShared, unseenDocuments, writeSeenShared } from './seenDocuments';

function fakeStorage(initial?: string): Storage {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('space:seen-shared-documents', initial);

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe('readSeenShared', () => {
  test('tells "never stored" apart from "stored, but empty"', () => {
    expect(readSeenShared(fakeStorage())).toBeNull();
    expect(readSeenShared(fakeStorage('[]'))).toEqual(new Set());
  });

  test('reads back what was written', () => {
    const storage = fakeStorage();
    writeSeenShared(['a', 'b'], storage);
    expect(readSeenShared(storage)).toEqual(new Set(['a', 'b']));
  });

  test('treats a corrupted entry as never stored', () => {
    expect(readSeenShared(fakeStorage('not json'))).toBeNull();
    expect(readSeenShared(fakeStorage('{"a":1}'))).toBeNull();
  });

  test('drops non-string entries from a hand-edited list', () => {
    expect(readSeenShared(fakeStorage('["a",7,null]'))).toEqual(new Set(['a']));
  });
});

describe('unseenDocuments', () => {
  test('returns only what has not been announced', () => {
    const documents = [{ id: 'a' }, { id: 'b' }];
    expect(unseenDocuments(documents, new Set(['a']))).toEqual([{ id: 'b' }]);
  });

  test('returns nothing when everything is known', () => {
    expect(unseenDocuments([{ id: 'a' }], new Set(['a']))).toEqual([]);
  });
});
