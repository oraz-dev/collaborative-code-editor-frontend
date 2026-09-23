import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { tokenStore } from '@/shared/api';
import { AI_PROXY_BASE_URL, createProxyFetch } from './aiProxy';

/**
 * Nothing in this file is an OpenRouter key, and nothing could be: the only
 * credential the proxy fetch knows about is this app's session token.
 */
const SESSION = 'session-token';
const REFRESHED = 'refreshed-token';

interface Call {
  url: string;
  init?: RequestInit;
}

/** A body that is a real stream, so "left unread" means something. */
function streamed(text: string, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

/**
 * Stands in for the whole server: `/auth/refresh` rotates the session, every
 * other path is the AI proxy answering with whatever the test queued.
 */
function server(responses: Array<() => Response>, refresh: () => Response) {
  const calls: Call[] = [];
  const refreshes: Call[] = [];
  let index = 0;

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) {
      refreshes.push({ url, init });
      return refresh();
    }
    calls.push({ url, init });
    const next = responses[index] ?? responses[responses.length - 1];
    index += 1;
    return next();
  });

  vi.stubGlobal('fetch', fetchImpl);
  return { calls, refreshes };
}

const ok = () => streamed('{"ok":true}');
const unauthorised = () => streamed('{"error":"expired"}', 401);
const rotated = () => new Response(JSON.stringify({ access_token: REFRESHED }), { status: 200 });
const refusedRefresh = () => new Response('no', { status: 401 });

function authOf(call: Call): string | null {
  return new Headers(call.init?.headers).get('Authorization');
}

describe('AI_PROXY_BASE_URL', () => {
  test('is this app, not openrouter.ai', () => {
    expect(AI_PROXY_BASE_URL).toBe('/api/ai/v1');
    expect(AI_PROXY_BASE_URL).not.toContain('openrouter');
  });
});

describe('createProxyFetch', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('sends the app session and the refresh cookie, never a key', async () => {
    tokenStore.set(SESSION);
    const { calls } = server([ok], rotated);

    await createProxyFetch()(`${AI_PROXY_BASE_URL}/models`, { method: 'GET' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/ai/v1/models');
    expect(authOf(calls[0])).toBe(`Bearer ${SESSION}`);
    expect(calls[0].init?.credentials).toBe('include');
  });

  test('sends no Authorization at all when there is no session', async () => {
    const { calls } = server([ok], refusedRefresh);

    await createProxyFetch()(`${AI_PROXY_BASE_URL}/models`);

    expect(authOf(calls[0])).toBeNull();
  });

  test('a caller-set Authorization is replaced by the session, never trusted', async () => {
    tokenStore.set(SESSION);
    const { calls } = server([ok], rotated);

    await createProxyFetch()(`${AI_PROXY_BASE_URL}/models`, {
      headers: { Authorization: 'Bearer borrowed', 'X-Title': 'kept' },
    });

    expect(authOf(calls[0])).toBe(`Bearer ${SESSION}`);
    expect(new Headers(calls[0].init?.headers).get('X-Title')).toBe('kept');
  });

  test('a 401 is refreshed once and the request replayed with the new token', async () => {
    tokenStore.set(SESSION);
    const { calls, refreshes } = server([unauthorised, ok], rotated);

    const response = await createProxyFetch()(`${AI_PROXY_BASE_URL}/chat/completions`, {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(refreshes).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls.map(authOf)).toEqual([`Bearer ${SESSION}`, `Bearer ${REFRESHED}`]);
    // The replay is the same request, not a reconstructed one.
    expect(calls[1].init?.method).toBe('POST');
    expect(calls[1].init?.body).toBe('{}');
    expect(tokenStore.get()).toBe(REFRESHED);
  });

  test('a second 401 is handed back as it arrived, with no further refresh', async () => {
    tokenStore.set(SESSION);
    const { calls, refreshes } = server([unauthorised, unauthorised], rotated);

    const response = await createProxyFetch()(`${AI_PROXY_BASE_URL}/chat/completions`);

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('{"error":"expired"}');
    // Exactly one refresh and one replay: never a loop.
    expect(refreshes).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  test('a refresh that fails returns the original 401, body intact', async () => {
    tokenStore.set(SESSION);
    const { calls, refreshes } = server([unauthorised], refusedRefresh);

    const response = await createProxyFetch()(`${AI_PROXY_BASE_URL}/key`);

    expect(response.status).toBe(401);
    expect(response.bodyUsed).toBe(false);
    await expect(response.text()).resolves.toBe('{"error":"expired"}');
    expect(refreshes).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  test('never reads the body — the stream is still the caller\'s to consume', async () => {
    tokenStore.set(SESSION);
    server([() => streamed('data: hello\n\n')], rotated);

    const response = await createProxyFetch()(`${AI_PROXY_BASE_URL}/chat/completions`);

    expect(response.bodyUsed).toBe(false);
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe('data: hello\n\n');
  });

  test('the replayed stream reaches the caller unread as well', async () => {
    tokenStore.set(SESSION);
    server([unauthorised, () => streamed('data: [DONE]\n\n')], rotated);

    const response = await createProxyFetch()(`${AI_PROXY_BASE_URL}/chat/completions`);

    expect(response.bodyUsed).toBe(false);
    await expect(response.text()).resolves.toBe('data: [DONE]\n\n');
  });

  test('a caller signal still reaches fetch', async () => {
    tokenStore.set(SESSION);
    const controller = new AbortController();
    const { calls } = server([ok], rotated);

    await createProxyFetch()(`${AI_PROXY_BASE_URL}/models`, { signal: controller.signal });

    expect(calls[0].init?.signal).toBe(controller.signal);
  });

  test('parallel 401s share one refresh', async () => {
    tokenStore.set(SESSION);
    const { refreshes } = server(
      [unauthorised, unauthorised, ok, ok],
      rotated,
    );

    const proxyFetch = createProxyFetch();
    const [first, second] = await Promise.all([
      proxyFetch(`${AI_PROXY_BASE_URL}/models`),
      proxyFetch(`${AI_PROXY_BASE_URL}/key`),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(refreshes).toHaveLength(1);
  });
});
