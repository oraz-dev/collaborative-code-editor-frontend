import { describe, expect, test, vi } from 'vitest';
import { createTypeFetcher, isImmutableUrl, NotFoundError } from './typeFetcher';

const EXACT = 'https://cdn.jsdelivr.net/npm/react@19.2.0/index.d.ts';
const RANGE = 'https://data.jsdelivr.com/v1/packages/npm/react/resolved?specifier=19';

function fakeCaches() {
  const store = new Map<string, string>();
  const cache = {
    match: vi.fn(async (url: string) => (store.has(url) ? new Response(store.get(url)) : undefined)),
    put: vi.fn(async (url: string, response: Response) => {
      store.set(url, await response.text());
    }),
  };
  return { caches: { open: vi.fn(async () => cache) } as unknown as CacheStorage, cache, store };
}

describe('isImmutableUrl', () => {
  test('an exact version can be kept; a range cannot', () => {
    expect(isImmutableUrl(EXACT)).toBe(true);
    expect(isImmutableUrl('https://data.jsdelivr.com/v1/packages/npm/react@19.2.0?structure=flat')).toBe(true);
    expect(isImmutableUrl(RANGE)).toBe(false);
    expect(isImmutableUrl('https://cdn.jsdelivr.net/npm/react@19/index.d.ts')).toBe(false);
  });
});

describe('createTypeFetcher', () => {
  test('retries a dropped connection', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response('ok'));
    const fetcher = createTypeFetcher({ fetch, caches: null });

    await expect(fetcher.text(EXACT)).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('does not retry a 404', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const fetcher = createTypeFetcher({ fetch, caches: null });

    await expect(fetcher.text(EXACT)).rejects.toBeInstanceOf(NotFoundError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('asks for each URL once per tab', async () => {
    const fetch = vi.fn(async () => new Response('ok'));
    const fetcher = createTypeFetcher({ fetch, caches: null });

    await Promise.all([fetcher.text(EXACT), fetcher.text(EXACT)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('keeps exact versions across sessions, and only those', async () => {
    const { caches, store } = fakeCaches();
    const fetch = vi.fn(async () => new Response('types'));

    await createTypeFetcher({ fetch, caches }).text(EXACT);
    await createTypeFetcher({ fetch, caches }).text(RANGE);
    await vi.waitFor(() => expect(store.has(EXACT)).toBe(true));
    expect(store.has(RANGE)).toBe(false);

    // A new tab: served from storage, not the network.
    const next = vi.fn();
    await expect(createTypeFetcher({ fetch: next, caches }).text(EXACT)).resolves.toBe('types');
    expect(next).not.toHaveBeenCalled();
  });

  test('a failure is not remembered', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('later'));
    const fetcher = createTypeFetcher({ fetch, caches: null });

    await expect(fetcher.text(EXACT)).rejects.toThrow();
    await expect(fetcher.text(EXACT)).resolves.toBe('later');
  });
});
