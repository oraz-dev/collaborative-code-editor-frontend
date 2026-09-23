import { useMemo } from 'react';
import { createOpenRouterClient, type OpenRouterClient } from '../openrouter/openrouter';
import { AI_PROXY_BASE_URL, createProxyFetch } from '../aiProxy/aiProxy';

/**
 * The assistant client, which every signed-in user has.
 *
 * The key is the server's, not the user's: requests go to this app's
 * `/api/ai/v1` proxy, which checks the session and attaches the key from its
 * own environment. There is nothing to configure in the browser, so there is
 * nothing to be missing — the client is always here, and a session that has
 * ended is found out where it matters, on the request, as a 'session' error.
 *
 * Built once for the whole app rather than per component: it holds no user
 * state, and the session it presents is read from `tokenStore` at send time,
 * so a sign-in or a token rotation needs no new client.
 */
let client: OpenRouterClient | null = null;

function assistantClient(): OpenRouterClient {
  client ??= createOpenRouterClient({
    baseUrl: AI_PROXY_BASE_URL,
    fetch: createProxyFetch(),
    auth: 'session',
  });
  return client;
}

export function useOpenRouterClient(): OpenRouterClient {
  return useMemo(() => assistantClient(), []);
}
