import { describe, expect, test } from 'vitest';
import { ApiError, isApiError } from './ApiError';

describe('ApiError.fromResponse', () => {
  test('lifts the message out of the error envelope', async () => {
    const response = new Response(JSON.stringify({ error: 'invalid document id' }), { status: 400 });
    const error = await ApiError.fromResponse(response);

    expect(error.message).toBe('invalid document id');
    expect(error.status).toBe(400);
    expect(error.kind).toBe('http');
  });

  test('falls back to the status when the body is empty', async () => {
    const error = await ApiError.fromResponse(new Response(null, { status: 500 }));
    expect(error.message).toBe('Request failed with status 500');
  });

  test('keeps a non-JSON body as text', async () => {
    const error = await ApiError.fromResponse(new Response('gateway down', { status: 502 }));
    expect(error.message).toBe('gateway down');
  });

  test('turns a field/rule map into a readable sentence', async () => {
    // The auth service answers validation failures with a nested object, which
    // would otherwise stringify to "[object Object]".
    const response = new Response(JSON.stringify({ error: { Email: 'email' } }), { status: 400 });
    const error = await ApiError.fromResponse(response);

    expect(error.message).toBe('Email must be a valid email address.');
    expect(error.fieldErrors).toEqual({ Email: 'email' });
  });

  test('describes several failed fields at once', async () => {
    const response = new Response(
      JSON.stringify({ error: { Email: 'required', Password: 'min' } }),
      { status: 400 },
    );
    const error = await ApiError.fromResponse(response);

    expect(error.message).toBe('Email is required. Password is too short.');
  });

  test('names an unfamiliar rule rather than hiding it', async () => {
    const response = new Response(JSON.stringify({ error: { Username: 'alphanum' } }), { status: 400 });
    const error = await ApiError.fromResponse(response);

    expect(error.message).toBe('Username is invalid (alphanum).');
  });

  test('falls back to the status for a bodyless response', async () => {
    // Both services reject an unrecognised Origin with exactly this.
    const error = await ApiError.fromResponse(new Response(null, { status: 403 }));

    expect(error.message).toBe('Request failed with status 403');
    expect(error.fieldErrors).toBeNull();
    expect(error.isForbidden).toBe(true);
  });
});

describe('ApiError.isRetryable', () => {
  test('retries connection faults and server errors', () => {
    expect(new ApiError({ message: '', kind: 'network' }).isRetryable).toBe(true);
    expect(new ApiError({ message: '', kind: 'timeout' }).isRetryable).toBe(true);
    expect(new ApiError({ message: '', kind: 'http', status: 500 }).isRetryable).toBe(true);
    expect(new ApiError({ message: '', kind: 'http', status: 429 }).isRetryable).toBe(true);
  });

  test('does not retry a deliberate client error or a cancellation', () => {
    expect(new ApiError({ message: '', kind: 'http', status: 400 }).isRetryable).toBe(false);
    expect(new ApiError({ message: '', kind: 'http', status: 401 }).isRetryable).toBe(false);
    expect(new ApiError({ message: '', kind: 'http', status: 403 }).isRetryable).toBe(false);
    expect(new ApiError({ message: '', kind: 'aborted' }).isRetryable).toBe(false);
  });
});

describe('ApiError.fromNetwork', () => {
  test('reports a caller-driven abort as cancelled', () => {
    const controller = new AbortController();
    controller.abort();
    expect(ApiError.fromNetwork(new Error('boom'), controller.signal).kind).toBe('aborted');
  });

  test('distinguishes a timeout', () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    expect(ApiError.fromNetwork(timeout).kind).toBe('timeout');
  });

  test('treats anything else as a connection failure', () => {
    expect(ApiError.fromNetwork(new TypeError('Failed to fetch')).kind).toBe('network');
  });
});

describe('isApiError', () => {
  test('narrows only real ApiErrors', () => {
    expect(isApiError(new ApiError({ message: 'x', kind: 'network' }))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
