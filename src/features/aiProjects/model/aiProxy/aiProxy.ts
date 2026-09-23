import { refreshAccessToken, tokenStore } from '@/shared/api';

/**
 * The assistant is reached through this app, never through openrouter.ai.
 *
 * `/api/ai/v1/...` is our own origin. Caddy checks the caller is signed in
 * (forward_auth against the auth service), attaches
 * `Authorization: Bearer <OPENROUTER_KEY from the server environment>` and
 * forwards to `https://openrouter.ai/api/v1/...`. Only three paths are
 * allowed through — `/chat/completions`, `/models` and `/key`; anything else
 * is a 404 from our server.
 *
 * So there is no OpenRouter key in this bundle, in `localStorage`, or in any
 * request this browser makes: the only credential sent is the app's own
 * session, and an expired one comes back as a 401 from our proxy rather than
 * from OpenRouter.
 */
export const AI_PROXY_BASE_URL = '/api/ai/v1';

/**
 * A `fetch` for the proxy: the app's session goes on, one refresh is spent on
 * a 401, and the response is handed back exactly as it arrived.
 *
 * The 401 policy is `shared/api`'s `httpClient`, restated rather than imported
 * because that client also encodes JSON bodies, parses responses and throws
 * `ApiError` — all three of which would destroy a streamed completion:
 *
 * - the access token comes from `tokenStore` at send time, so the replay
 *   carries the *new* token and not the one that had just expired;
 * - `credentials: 'include'` so the HttpOnly refresh cookie travels;
 * - `refreshAccessToken()` is single-flight in `shared/api`, so parallel 401s
 *   here await one rotation instead of racing each other out of a session;
 * - exactly one replay. A second 401 is the answer, not a reason to loop.
 *
 * Signals are merged the way `httpClient` merges them — each attempt derives
 * its signal afresh — with one deliberate difference: no deadline of ours is
 * combined in. `httpClient`'s 20s timeout suits small JSON calls, but the
 * signal on a `fetch` also aborts the body, and a generation streams for
 * minutes. The caller owns the deadline (`openrouter.ts` puts one on the
 * metadata calls and none on `chat`), so the caller's signal passes through
 * untouched.
 *
 * The `Response` is returned unread: `response.body` is still the live stream
 * the SSE reader consumes.
 */
export function createProxyFetch(): typeof fetch {
  return async function proxyFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const send = (token: string | null): Promise<Response> => {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      // Never a borrowed or stale credential: this header is ours to set, and
      // the only thing that belongs in it is this app's session.
      if (token) headers.set('Authorization', `Bearer ${token}`);
      else headers.delete('Authorization');

      return fetch(input, { ...init, headers, credentials: 'include' });
    };

    const response = await send(tokenStore.get());
    if (response.status !== 401) return response;

    const token = await refreshAccessToken();
    if (!token) return response;

    // The rejected response is about to be replaced, so its body is released
    // rather than left open; the replay's response is the one the caller reads.
    void response.body?.cancel().catch(() => undefined);

    return send(token);
  };
}
