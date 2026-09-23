import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { tokenStore } from '@/shared/api';
import { AI_PROXY_BASE_URL } from '../aiProxy/aiProxy';
import { useOpenRouterClient } from './useOpenRouterClient';

describe('useOpenRouterClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    tokenStore.clear();
  });

  test('always has a client — there is nothing for the user to configure', () => {
    const { result } = renderHook(() => useOpenRouterClient());

    expect(result.current).not.toBeNull();
    expect(typeof result.current.chat).toBe('function');
    expect(typeof result.current.listFreeModels).toBe('function');
    expect(typeof result.current.verifyKey).toBe('function');
  });

  test('is the same client on every render and in every component', () => {
    const { result, rerender } = renderHook(() => useOpenRouterClient());
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);

    const second = renderHook(() => useOpenRouterClient());
    expect(second.result.current).toBe(first);
  });

  test('calls this app, with the session and no key of its own', async () => {
    tokenStore.set('session-token');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    vi.stubGlobal('fetch', fetchImpl);

    const { result } = renderHook(() => useOpenRouterClient());
    await result.current.listFreeModels();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${AI_PROXY_BASE_URL}/models`);
    expect(url).not.toContain('openrouter.ai');
    // The app's own session; the OpenRouter key is added by the server.
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer session-token');
    expect(init.credentials).toBe('include');
  });

  test('a refused session is reported as a session, not as a key', async () => {
    tokenStore.set('expired');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith('/auth/refresh')
        ? new Response('no', { status: 401 })
        : new Response('{"error":{"code":401,"message":"unauthorised"}}', { status: 401 })
    )));

    const { result } = renderHook(() => useOpenRouterClient());
    const failure = await result.current
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 })
      .catch((error: unknown) => error as Error);

    expect(failure).toMatchObject({ kind: 'auth' });
    expect((failure as Error).message).toContain('Your session has expired.');
    expect((failure as Error).message).not.toMatch(/API key/i);
  });
});
