export type ApiErrorKind = 'network' | 'timeout' | 'aborted' | 'http';

interface ApiErrorParams {
  message: string;
  kind: ApiErrorKind;
  status?: number;
  payload?: unknown;
}

/**
 * Both services answer failures with `{ "error": "..." }`, so every transport
 * failure is normalised into this one shape. `isRetryable` is what the query
 * layer consults before backing off, which keeps retry policy in one place.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly payload: unknown;

  constructor({ message, kind, status = 0, payload }: ApiErrorParams) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.payload = payload;
  }

  /** Connection-level failures and server faults are worth another attempt. */
  get isRetryable(): boolean {
    if (this.kind === 'aborted') return false;
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    if (this.status === 408 || this.status === 425 || this.status === 429) return true;
    return this.status >= 500;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let payload: unknown;
    let message = `Request failed with status ${response.status}`;

    try {
      const text = await response.text();
      if (text) {
        try {
          payload = JSON.parse(text);
          const parsed = payload as { error?: string; message?: string };
          message = parsed?.error ?? parsed?.message ?? message;
        } catch {
          payload = text;
          message = text.slice(0, 200);
        }
      }
    } catch {
      // body already consumed or unreadable — keep the status-based message
    }

    return new ApiError({ message, kind: 'http', status: response.status, payload });
  }

  /** Distinguishes a caller-driven abort from a timeout from a dead connection. */
  static fromNetwork(error: unknown, callerSignal?: AbortSignal): ApiError {
    if (callerSignal?.aborted) {
      return new ApiError({ message: 'Request cancelled', kind: 'aborted' });
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return new ApiError({ message: 'The request timed out', kind: 'timeout' });
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new ApiError({ message: 'Request cancelled', kind: 'aborted' });
    }
    return new ApiError({
      message: 'Could not reach the server. Check your connection.',
      kind: 'network',
    });
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
