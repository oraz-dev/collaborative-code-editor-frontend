/**
 * Base URLs are relative by default so every call goes through the dev proxy
 * (see vite.config.ts). Neither upstream sends CORS headers, so calling them
 * cross-origin from the browser is not possible — in production these must
 * point at a same-origin gateway (or the services must start sending CORS).
 */
export const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL ?? '/api/auth';
export const DOCS_BASE_URL = import.meta.env.VITE_DOCS_BASE_URL ?? '/api/v1';

/** Access tokens live ~15 minutes; refresh a little early to avoid races. */
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60 * 1000;

/** ws-tickets expire in 15s, so they are minted per connection attempt. */
export const WS_TICKET_TTL_MS = 15 * 1000;

/** Default per-request timeout. Kept generous for slow mobile networks. */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Resolves the absolute ws:// URL for a document's collaboration socket,
 * keeping the dev-proxy path when the base URL is relative.
 */
export function resolveWebSocketUrl(documentId: string, ticket: string): string {
  const base = DOCS_BASE_URL.startsWith('http')
    ? DOCS_BASE_URL
    : `${window.location.origin}${DOCS_BASE_URL}`;
  const url = new URL(`${base}/documents/${documentId}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}
