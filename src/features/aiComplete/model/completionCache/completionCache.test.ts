import { describe, expect, test } from 'vitest';
import { createCompletionCache } from './completionCache';

describe('createCompletionCache', () => {
  test('serves the same site from memory', () => {
    const cache = createCompletionCache();
    cache.set('const a = ', ';', '1');

    expect(cache.get('const a = ', ';')).toBe('1');
  });

  test('a different suffix is a different site', () => {
    const cache = createCompletionCache();
    cache.set('const a = ', ';', '1');

    expect(cache.get('const a = ', ')')).toBeNull();
  });

  test('knows nothing it was never told', () => {
    expect(createCompletionCache().get('a', 'b')).toBeNull();
  });

  test('an empty completion is not worth remembering', () => {
    const cache = createCompletionCache();
    cache.set('a', 'b', '');

    expect(cache.size).toBe(0);
    expect(cache.get('a', 'b')).toBeNull();
  });

  test('drops the least recently used entry once it is full', () => {
    const cache = createCompletionCache(2);
    cache.set('one', '', 'A');
    cache.set('two', '', 'B');
    // Reading `one` makes `two` the oldest.
    expect(cache.get('one', '')).toBe('A');
    cache.set('three', '', 'C');

    expect(cache.size).toBe(2);
    expect(cache.get('two', '')).toBeNull();
    expect(cache.get('one', '')).toBe('A');
    expect(cache.get('three', '')).toBe('C');
  });

  test('clear forgets everything, including the last suggestion', () => {
    const cache = createCompletionCache();
    cache.set('const a = ', ';', '1 + 2');
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('const a = 1', ';')).toBeNull();
  });
});

describe('typing out the last suggestion', () => {
  test('serves the remainder without another request', () => {
    const cache = createCompletionCache();
    cache.set('items', '', '.map((item) => item.id)');

    expect(cache.get('items.m', '')).toBe('ap((item) => item.id)');
    expect(cache.get('items.map(', '')).toBe('(item) => item.id)');
  });

  test('stops once the user types something the suggestion did not offer', () => {
    const cache = createCompletionCache();
    cache.set('items', '', '.map((item) => item.id)');

    expect(cache.get('items.f', '')).toBeNull();
  });

  test('gives nothing back when the whole suggestion has been typed', () => {
    const cache = createCompletionCache();
    cache.set('items', '', '.length');

    expect(cache.get('items.length', '')).toBeNull();
  });

  test('only continues the last suggestion, not an older one', () => {
    const cache = createCompletionCache();
    cache.set('items', '', '.map(fn)');
    cache.set('total', '', ' = 0;');

    expect(cache.get('items.m', '')).toBeNull();
    expect(cache.get('total ', '')).toBe('= 0;');
  });

  test('does not continue across a changed suffix', () => {
    const cache = createCompletionCache();
    cache.set('items', ';', '.map(fn)');

    expect(cache.get('items.m', ')')).toBeNull();
  });

  test('an unchanged prefix falls through to the exact entry, not the remainder', () => {
    const cache = createCompletionCache();
    cache.set('items', '', '.map(fn)');

    expect(cache.get('items', '')).toBe('.map(fn)');
  });
});
