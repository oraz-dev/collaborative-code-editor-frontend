import { AUTH_BASE_URL, REQUEST_TIMEOUT_MS } from '../../config/apiConfig';
import { ApiError } from '../ApiError/ApiError';
import { emitSessionExpired } from '../sessionEvents/sessionEvents';
import { tokenStore } from '../tokenStore/tokenStore';

export interface HttpRequestOptions extends Omit<RequestInit, 'body' | 'signal'> {
  /** Serialised as JSON. Use `undefined` for bodyless verbs. */
  body?: unknown;
  timeoutMs?: number;
  /** Set false for login/register so a 401 is surfaced instead of triggering refresh. */
  auth?: boolean;
  signal?: AbortSignal;
}

let refreshPromise: Promise<string | null> | null = null;

async function requestNewAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/auth/refresh`, {
      method: 'POST',
      // the refresh token is an HttpOnly cookie; it only travels with this
      credentials: 'include',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    // network failure during refresh is not proof the session is gone
    return null;
  }
}

/**
 * Single-flight refresh.
 *
 * The server rotates the refresh cookie on every call, so two parallel
 * refreshes would race and invalidate one another — leaving the user logged
 * out at random. Every 401 therefore awaits the same in-flight promise.
 */
export function refreshAccessToken(): Promise<string | null> {
  // Captured before the request so a failed refresh can tell "your session
  // ended" apart from "this visitor was never signed in" — only the first
  // deserves to bounce the user out of the app.
  const hadSession = tokenStore.get() !== null;

  refreshPromise ??= requestNewAccessToken()
    .then((token) => {
      if (token) {
        tokenStore.set(token);
      } else {
        tokenStore.clear();
        if (hadSession) emitSessionExpired();
      }
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function mergeSignals(caller: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * Creates a fetch wrapper bound to one service. Handles JSON encoding, bearer
 * injection, timeouts, error normalisation, and a single transparent retry
 * after refreshing an expired access token (they live only 15 minutes).
 */
export function createHttpClient(baseUrl: string) {
  return async function request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const {
      body,
      timeoutMs = REQUEST_TIMEOUT_MS,
      auth = true,
      headers,
      signal,
      ...rest
    } = options;

    const send = async (token: string | null): Promise<Response> => {
      const finalHeaders = new Headers(headers);
      if (body !== undefined) finalHeaders.set('Content-Type', 'application/json');
      if (token) finalHeaders.set('Authorization', `Bearer ${token}`);

      try {
        return await fetch(`${baseUrl}${path}`, {
          ...rest,
          headers: finalHeaders,
          credentials: 'include',
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: mergeSignals(signal, timeoutMs),
        });
      } catch (error) {
        throw ApiError.fromNetwork(error, signal);
      }
    };

    let response = await send(auth ? tokenStore.get() : null);

    if (response.status === 401 && auth) {
      const token = await refreshAccessToken();
      if (token) {
        response = await send(token);
      }
    }

    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }

    return parseResponseBody<T>(response);
  };
}
