import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHttpClient, refreshAccessToken } from './httpClient';
import { tokenStore } from '../tokenStore/tokenStore';
import { ApiError } from '../ApiError/ApiError';
import { onSessionExpired } from '../sessionEvents/sessionEvents';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('httpClient', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('sends the bearer token and parses the JSON body', async () => {
    tokenStore.set('token-abc');
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      calls.push([String(input), init]);
      return json({ id: '1' });
    }));

    const request = createHttpClient('/api/v1');
    await expect(request('/documents/1')).resolves.toEqual({ id: '1' });

    const [url, init] = calls[0];
    expect(url).toBe('/api/v1/documents/1');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-abc');
  });

  test('refreshes once and replays the request after a 401', async () => {
    tokenStore.set('expired');
    let dataCalls = 0;
    const replayedAuth: Array<string | null> = [];

    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith('/refresh')) return json({ access_token: 'fresh' });

      dataCalls += 1;
      if (dataCalls === 1) return json({ error: 'expired' }, 401);

      replayedAuth.push(new Headers(init?.headers).get('Authorization'));
      return json({ ok: true });
    }));

    const request = createHttpClient('/api/v1');
    await expect(request('/documents/roots')).resolves.toEqual({ ok: true });

    expect(dataCalls).toBe(2);
    // the replay must carry the new token, not the stale one
    expect(replayedAuth).toEqual(['Bearer fresh']);
    expect(tokenStore.get()).toBe('fresh');
  });

  test('shares one refresh across concurrent 401s', async () => {
    // The server rotates the refresh cookie on every call, so a second
    // parallel refresh would invalidate the first and sign the user out.
    tokenStore.set('expired');
    let refreshCalls = 0;
    const seen = new Set<string>();

    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/refresh')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json({ access_token: 'fresh' });
      }
      if (!seen.has(url)) {
        seen.add(url);
        return json({ error: 'expired' }, 401);
      }
      return json({ url });
    }));

    const request = createHttpClient('/api/v1');
    await Promise.all([
      request('/documents/a'),
      request('/documents/b'),
      request('/documents/c'),
    ]);

    expect(refreshCalls).toBe(1);
  });

  test('does not attempt a refresh when auth is disabled', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'bad credentials' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const request = createHttpClient('/api/auth');
    await expect(request('/login', { method: 'POST', body: {}, auth: false }))
      .rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('normalises a connection failure into a retryable ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const request = createHttpClient('/api/v1');
    const error = await request('/documents/roots').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
    expect((error as ApiError).isRetryable).toBe(true);
  });

  test('surfaces the server error message', async () => {
    tokenStore.set('token');
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'you do not have access' }, 403)));

    const request = createHttpClient('/api/v1');
    const error = await request('/documents/1').catch((e: unknown) => e);

    expect((error as ApiError).message).toBe('you do not have access');
    expect((error as ApiError).isForbidden).toBe(true);
    expect((error as ApiError).isRetryable).toBe(false);
  });

  test('returns undefined for a 204 response', async () => {
    tokenStore.set('token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));

    const request = createHttpClient('/api/auth');
    await expect(request('/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('refreshAccessToken', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('announces an expired session only when one existed', async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'missing refresh token' }, 401)));

    // cold start, nobody was signed in
    await refreshAccessToken();
    expect(listener).not.toHaveBeenCalled();

    // a real session that could not be renewed
    tokenStore.set('was-signed-in');
    await refreshAccessToken();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
