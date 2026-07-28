type TokenListener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<TokenListener>();

/**
 * The access token is deliberately kept in memory only. Durability comes from
 * the HttpOnly `refresh_token` cookie, so a reload silently re-establishes the
 * session without ever exposing a long-lived credential to scripts.
 */
export const tokenStore = {
  get(): string | null {
    return accessToken;
  },

  set(token: string | null): void {
    if (accessToken === token) return;
    accessToken = token;
    listeners.forEach((listener) => listener(token));
  },

  clear(): void {
    tokenStore.set(null);
  },

  subscribe(listener: TokenListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Reads the `sub` claim without verifying — used only for UI, never for trust. */
export function readUserIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { sub?: string };
    return claims.sub ?? null;
  } catch {
    return null;
  }
}
