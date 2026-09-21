import type { TypeFetcher } from '../acquireTypes/acquireTypes';

/** Bumped when the shape of what is stored changes, so old entries are ignored. */
export const TYPE_CACHE_NAME = 'space-package-types-v1';
const ATTEMPTS = 3;

/**
 * A URL naming one exact published version: `react@19.2.0/…`. Its content can
 * never change, so it is kept across sessions. A range (`react@19`) or the
 * version-resolving endpoint can, so those are only remembered for this tab.
 */
export function isImmutableUrl(url: string): boolean {
  return /@\d+\.\d+\.\d+[^/?]*(?:\/|\?structure=flat$)/.test(url) && !url.includes('/resolved?');
}

export class NotFoundError extends Error {
  constructor(url: string) {
    super(`Not found: ${url}`);
    this.name = 'NotFoundError';
  }
}

interface TypeFetcherOptions {
  fetch?: typeof globalThis.fetch;
  /** Cache Storage, when the browser offers it; absent in tests and private windows. */
  caches?: CacheStorage | null;
}

/**
 * Fetches package files for type acquisition.
 *
 * - Every URL is fetched once per tab, however many packages ask for it.
 * - Exact-version files persist in Cache Storage: a project reopened tomorrow
 *   has its types at once, instead of paying hundreds of requests again.
 * - A dropped connection is retried (the CDN does cut large files short); a
 *   404 is an answer and is not.
 */
export function createTypeFetcher(options: TypeFetcherOptions = {}): TypeFetcher {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const storage = options.caches === undefined
    ? (typeof caches === 'undefined' ? null : caches)
    : options.caches;
  const memory = new Map<string, Promise<string>>();
  let cache: Promise<Cache | null> | null = null;

  const openCache = () => {
    cache ??= storage ? storage.open(TYPE_CACHE_NAME).catch(() => null) : Promise.resolve(null);
    return cache;
  };

  async function download(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchImpl(url);
        if (response.status === 404) throw new NotFoundError(url);
        if (!response.ok) throw new Error(`${response.status} for ${url}`);
        return await response.text();
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  async function load(url: string): Promise<string> {
    const persistent = isImmutableUrl(url) ? await openCache() : null;

    if (persistent) {
      try {
        const hit = await persistent.match(url);
        if (hit) return await hit.text();
      } catch {
        // A broken cache is a cache miss.
      }
    }

    const text = await download(url);

    if (persistent) {
      // Storage full or refused: the types still work, just not next time.
      persistent.put(url, new Response(text)).catch(() => undefined);
    }
    return text;
  }

  return {
    text(url) {
      let pending = memory.get(url);
      if (!pending) {
        pending = load(url);
        // A failure is not remembered, so the next project open can try again.
        pending.catch(() => memory.delete(url));
        memory.set(url, pending);
      }
      return pending;
    },
  };
}
