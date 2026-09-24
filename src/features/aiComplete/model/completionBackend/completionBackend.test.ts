import { describe, expect, test, vi } from 'vitest';
import type { ChatMessage } from '@/features/aiProjects';
import {
  CompletionError,
  FAST_MODEL_FALLBACK,
  FAST_PROXY_BASE_URL,
  pickFastModel,
  probeFastBackend,
  requestCompletion,
} from './completionBackend';

/** The body the deployed fast route answers with today: no provider key behind it. */
const NO_PROVIDER_KEY = JSON.stringify({
  error: { message: 'Invalid API Key', code: 'invalid_api_key' },
});

/** Our own proxy refusing a session, which says nothing about a provider key. */
const NO_SESSION = JSON.stringify({ error: 'unauthorized' });

function answering(body: string, init: ResponseInit = {}): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('probeFastBackend', () => {
  test('a catalogue means the backend is live, and names its models', async () => {
    const fetchImpl = answering(JSON.stringify({
      data: [{ id: 'llama-3.1-8b-instant' }, { id: 'whisper-large-v3' }],
    }), { status: 200 });

    await expect(probeFastBackend(fetchImpl)).resolves.toEqual({
      state: 'available',
      models: ['llama-3.1-8b-instant', 'whisper-large-v3'],
    });
    expect(fetchImpl).toHaveBeenCalledWith(`${FAST_PROXY_BASE_URL}/models`, { method: 'GET' });
  });

  test('asks exactly once', async () => {
    const fetchImpl = answering('{"data":[]}', { status: 200 });
    await probeFastBackend(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('the provider refusing the key it was handed means unconfigured', async () => {
    await expect(probeFastBackend(answering(NO_PROVIDER_KEY, { status: 401 })))
      .resolves.toEqual({ state: 'unconfigured', models: [] });
    await expect(probeFastBackend(answering(NO_PROVIDER_KEY, { status: 403 })))
      .resolves.toEqual({ state: 'unconfigured', models: [] });
  });

  test('a 401 that is not about a provider key means the session was refused', async () => {
    await expect(probeFastBackend(answering(NO_SESSION, { status: 401 })))
      .resolves.toEqual({ state: 'unauthenticated', models: [] });
  });

  test('no such route means there is no fast backend to configure', async () => {
    await expect(probeFastBackend(answering('not found', { status: 404 })))
      .resolves.toEqual({ state: 'unconfigured', models: [] });
  });

  test('a network failure is offline, not a verdict on the key', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(probeFastBackend(fetchImpl)).resolves.toEqual({ state: 'offline', models: [] });
  });

  test('a server error is offline too', async () => {
    await expect(probeFastBackend(answering('gateway', { status: 502 })))
      .resolves.toEqual({ state: 'offline', models: [] });
  });

  test('a 200 that is not a catalogue still counts as live', async () => {
    await expect(probeFastBackend(answering('<html>', { status: 200 })))
      .resolves.toEqual({ state: 'available', models: [] });
  });
});

describe('pickFastModel', () => {
  test('follows the preference order rather than the catalogue order', () => {
    expect(pickFastModel(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']))
      .toBe('llama-3.1-8b-instant');
  });

  test('matches an id that carries a date or revision', () => {
    expect(pickFastModel(['groq/llama-3.1-8b-instant-20250101'])).toBe('groq/llama-3.1-8b-instant-20250101');
  });

  test('never picks a model that cannot write code', () => {
    expect(pickFastModel(['whisper-large-v3', 'llama-guard-4-12b', 'playai-tts']))
      .toBe(FAST_MODEL_FALLBACK);
  });

  test('takes an unrecognised model over a hardcoded id the account may not have', () => {
    expect(pickFastModel(['some-new-small-model'])).toBe('some-new-small-model');
  });

  test('falls back when the list is empty', () => {
    expect(pickFastModel([])).toBe(FAST_MODEL_FALLBACK);
  });
});

describe('requestCompletion', () => {
  const answer = JSON.stringify({ choices: [{ message: { content: 'a + b;' } }] });

  test('posts to the fast route and returns the content', async () => {
    const fetchImpl = answering(answer, { status: 200 });

    await expect(requestCompletion({
      backend: 'fast', messages, maxTokens: 64, model: 'm', fetchImpl,
    })).resolves.toBe('a + b;');

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/ai/fast/v1/chat/completions');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'm',
      messages,
      max_tokens: 64,
      stream: false,
    });
  });

  test('posts to the assistant proxy for the on-demand backend', async () => {
    const fetchImpl = answering(answer, { status: 200 });
    await requestCompletion({ backend: 'onDemand', messages, maxTokens: 64, fetchImpl });

    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/ai/v1/chat/completions');
  });

  test('a refused request throws with the service’s own words', async () => {
    const fetchImpl = answering(NO_PROVIDER_KEY, { status: 401 });

    await expect(requestCompletion({ backend: 'fast', messages, maxTokens: 64, fetchImpl }))
      .rejects.toThrow('Invalid API Key');
  });

  test('a status with no readable body still says what happened', async () => {
    const fetchImpl = answering('<html>', { status: 429 });
    const error = await requestCompletion({ backend: 'fast', messages, maxTokens: 64, fetchImpl })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CompletionError);
    expect((error as CompletionError).status).toBe(429);
    expect((error as CompletionError).message).toContain('429');
  });

  test('a 200 carrying an error instead of a choice is a failure', async () => {
    const fetchImpl = answering(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), { status: 200 });

    await expect(requestCompletion({ backend: 'onDemand', messages, maxTokens: 64, fetchImpl }))
      .rejects.toThrow('Rate limit exceeded');
  });

  test('an unreadable body is reported rather than returned as a completion', async () => {
    const fetchImpl = answering('not json at all', { status: 200 });

    await expect(requestCompletion({ backend: 'fast', messages, maxTokens: 64, fetchImpl }))
      .rejects.toThrow(/could not read/i);
  });

  test('an aborted request is reported as cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError');
    }) as unknown as typeof fetch;

    await expect(requestCompletion({
      backend: 'fast', messages, maxTokens: 64, fetchImpl, signal: controller.signal,
    })).rejects.toThrow(/cancelled/i);
  });
});
