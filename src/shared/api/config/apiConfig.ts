/**
 * Base URLs are relative by default so every call goes through the dev proxy
 * (see vite.config.ts). Neither upstream sends CORS headers, so calling them
 * cross-origin from the browser is not possible — in production these must
 * point at a same-origin gateway (or the services must start sending CORS).
 */
/**
 * The auth service ROOT, not its `/auth` prefix — sessions live under
 * `/auth/…` but user lookup is at `/users`, so call sites pass the full path.
 */
export const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL ?? '/api/auth';
export const DOCS_BASE_URL = import.meta.env.VITE_DOCS_BASE_URL ?? '/api/v1';

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
