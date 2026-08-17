export type ApiErrorKind = 'network' | 'timeout' | 'aborted' | 'http';

interface ApiErrorParams {
  message: string;
  kind: ApiErrorKind;
  status?: number;
  payload?: unknown;
  fieldErrors?: Record<string, string>;
}

/**
 * Validation failures arrive as `{ "error": { "Email": "email" } }` — a map of
 * field name to the rule that failed, not a sentence. These turn the rule into
 * something a person can act on.
 */
const RULE_TEXT: Record<string, string> = {
  email: 'must be a valid email address',
  required: 'is required',
  min: 'is too short',
  max: 'is too long',
  gte: 'is too small',
  lte: 'is too large',
  uuid: 'must be a valid id',
};

function humaniseField(field: string): string {
  const spaced = field.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function readFieldErrors(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function describeFieldErrors(fieldErrors: Record<string, string>): string {
  return Object.entries(fieldErrors)
    .map(([field, rule]) => `${humaniseField(field)} ${RULE_TEXT[rule] ?? `is invalid (${rule})`}.`)
    .join(' ');
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
  /** Field name -> failed rule, when the server rejected specific inputs. */
  readonly fieldErrors: Record<string, string> | null;

  constructor({ message, kind, status = 0, payload, fieldErrors }: ApiErrorParams) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.payload = payload;
    this.fieldErrors = fieldErrors ?? null;
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
    let fieldErrors: Record<string, string> | undefined;
    let message = `Request failed with status ${response.status}`;

    try {
      const text = await response.text();
      if (text) {
        try {
          payload = JSON.parse(text);
          const parsed = payload as { error?: unknown; message?: unknown };
          const detail = parsed?.error ?? parsed?.message;

          if (typeof detail === 'string') {
            message = detail;
          } else {
            // Validation failures nest a field -> rule map under `error`,
            // which would otherwise stringify to "[object Object]".
            const parsedFields = readFieldErrors(detail);
            if (parsedFields) {
              fieldErrors = parsedFields;
              message = describeFieldErrors(parsedFields);
            }
          }
        } catch {
          payload = text;
          message = text.slice(0, 200);
        }
      }
    } catch {
      // body already consumed or unreadable — keep the status-based message
    }

    return new ApiError({ message, kind: 'http', status: response.status, payload, fieldErrors });
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
