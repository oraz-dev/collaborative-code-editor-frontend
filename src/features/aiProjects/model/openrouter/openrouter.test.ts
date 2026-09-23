import { describe, expect, test, vi } from 'vitest';
import {
  createOpenRouterClient,
  isOpenRouterError,
  OpenRouterError,
  redact,
} from './openrouter';

/** Never a real key, and long enough to exercise the redaction path. */
const API_KEY = 'test-key';
const BASE = 'https://openrouter.test/api/v1';

function client(fetchImpl: typeof globalThis.fetch) {
  return createOpenRouterClient({ apiKey: API_KEY, fetch: fetchImpl, baseUrl: BASE, referer: 'https://app.test' });
}

/** The way this app builds it: no key of its own, the session's to blame. */
function proxied(fetchImpl: typeof globalThis.fetch) {
  return createOpenRouterClient({
    fetch: fetchImpl,
    baseUrl: '/api/ai/v1',
    auth: 'session',
    referer: 'https://app.test',
  });
}

/** A body delivered as bytes, so chunk boundaries are the transport's. */
function byteStream(text: string, bytesPerChunk: number): Response {
  const encoded = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < encoded.length; index += bytesPerChunk) {
        controller.enqueue(encoded.slice(index, index + bytesPerChunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function deltaEvent(content: string): string {
  return `data: ${JSON.stringify({ model: 'a/model:free', choices: [{ delta: { content } }] })}\n\n`;
}

const FINAL_EVENT = `data: ${JSON.stringify({
  model: 'a/model:free',
  choices: [{ delta: { content: '' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
})}\n\n`;

async function collect(response: Response, onDelta = vi.fn()) {
  const result = await client(vi.fn(async () => response)).chat({
    model: 'a/model:free',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 100,
    onDelta,
  });
  return { result, onDelta };
}

describe('redact', () => {
  test('removes the configured key and anything shaped like one', () => {
    expect(redact('bad key test-key here', API_KEY)).toBe('bad key [redacted] here');
    expect(redact('Bearer sk-or-v1-not-a-real-key')).toBe('Bearer [redacted]');
  });

  test('leaves ordinary text alone', () => {
    expect(redact('rate limited upstream', API_KEY)).toBe('rate limited upstream');
  });
});

describe('listFreeModels', () => {
  test('keeps only free ids and maps what the chain needs', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          id: 'qwen/qwen3.8-27b:free',
          name: 'Qwen: Qwen3.8 27B (free)',
          context_length: 262_144,
          top_provider: { max_completion_tokens: 235_929 },
          supported_parameters: ['structured_outputs', 'tools'],
        },
        {
          id: 'google/gemma-4-31b-it:free',
          name: 'Google: Gemma 4 31B (free)',
          context_length: 262_144,
          top_provider: { max_completion_tokens: 32_768 },
          supported_parameters: ['response_format'],
        },
        // No completion cap published: the context is the cap.
        { id: 'someone/small:free', context_length: 8_192, supported_parameters: [] },
        { id: 'paid/model', context_length: 200_000, supported_parameters: ['structured_outputs'] },
      ],
    })));

    const models = await client(fetchImpl as unknown as typeof globalThis.fetch).listFreeModels();

    expect(models.map((model) => model.id)).toEqual([
      'qwen/qwen3.8-27b:free',
      'google/gemma-4-31b-it:free',
      'someone/small:free',
    ]);
    expect(models[0]).toMatchObject({ label: 'Qwen: Qwen3.8 27B (free)', maxOutput: 235_929, structured: true });
    expect(models[1].structured).toBe(false);
    expect(models[2]).toMatchObject({ label: 'someone/small:free', maxOutput: 8_192 });
  });

  test('sends the attribution headers and the key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    await client(fetchImpl as unknown as typeof globalThis.fetch).listFreeModels();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe(`${BASE}/models`);
    expect(headers.get('Authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headers.get('HTTP-Referer')).toBe('https://app.test');
    expect(headers.get('X-Title')).toBe('Collaborative Code Editor');
  });
});

describe('verifyKey', () => {
  test('reports the key label without ever returning the key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { label: 'editor key', is_free_tier: true, usage: 0 },
    })));

    const info = await client(fetchImpl as unknown as typeof globalThis.fetch).verifyKey();

    expect(info).toEqual({ valid: true, label: 'editor key', freeTier: true });
    expect(JSON.stringify(info)).not.toContain(API_KEY);
  });

  test('a rejected key is an answer, not a failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":401,"message":"bad"}}', { status: 401 }));

    await expect(client(fetchImpl as unknown as typeof globalThis.fetch).verifyKey())
      .resolves.toEqual({ valid: false, label: null, freeTier: false });
  });

  test('a server fault still throws — it says nothing about the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(client(fetchImpl as unknown as typeof globalThis.fetch).verifyKey())
      .rejects.toMatchObject({ kind: 'server', retryable: true });
  });

  test('a 200 body that quotes the key back cannot reach the message', async () => {
    // A proxy in front of OpenRouter answering 200 with an error object is the
    // one path that used to carry the Authorization header onto the screen.
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 429, message: `No auth credentials found: Bearer ${API_KEY}` } }),
    ));

    const failure: unknown = await client(fetchImpl as unknown as typeof globalThis.fetch)
      .verifyKey()
      .catch((error: unknown) => error);

    expect(isOpenRouterError(failure)).toBe(true);
    expect((failure as OpenRouterError).message).not.toContain(API_KEY);
    expect((failure as OpenRouterError).message).toContain('[redacted]');
  });

  test('a label that is somehow the key is redacted before it is returned', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { label: `leaked ${API_KEY}`, is_free_tier: true },
    })));

    const info = await client(fetchImpl as unknown as typeof globalThis.fetch).verifyKey();

    expect(info.label).toBe('leaked [redacted]');
  });
});

describe('listFreeModels failures', () => {
  test('a 200 body that quotes the key back cannot reach the message', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 500, message: `upstream said Bearer ${API_KEY}` } }),
    ));

    const failure: unknown = await client(fetchImpl as unknown as typeof globalThis.fetch)
      .listFreeModels()
      .catch((error: unknown) => error);

    expect((failure as OpenRouterError).message).not.toContain(API_KEY);
    expect((failure as OpenRouterError).message).toContain('[redacted]');
  });
});

describe('error codes that are not numbers', () => {
  const cases: Array<[unknown, string, boolean]> = [
    ['429', 'rateLimited', true],
    ['rate_limit_exceeded', 'rateLimited', true],
    ['insufficient_quota', 'payment', false],
    ['server_error', 'server', true],
    // A word this app does not know is still the provider reporting a failure,
    // so another model is worth trying; `bad-response` would end the walk.
    ['something_new_entirely', 'server', true],
  ];

  test.each(cases)('a code of %j is %s (worth another model: %s)', async (code, kind, worthAnotherModel) => {
    const fetchImpl = vi.fn(async () => new Response(
      `${deltaEvent('{"files":[')}data: ${JSON.stringify({ error: { code, message: 'rate limited' } })}\n\n`,
    ));

    const failure: unknown = await client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10, onDelta: vi.fn() })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind, worthAnotherModel, partial: '{"files":[' });
  });
});

describe('chat errors', () => {
  const cases: Array<[number, string, boolean]> = [
    [401, 'auth', false],
    [402, 'payment', false],
    [403, 'forbidden', false],
    [429, 'rateLimited', true],
    [500, 'server', true],
    [502, 'server', true],
    [418, 'bad-response', false],
  ];

  test.each(cases)('status %i is %s (retryable: %s)', async (status, kind, retryable) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: status, message: 'nope' } }), { status }));

    const failure = await client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 })
      .catch((error: unknown) => error);

    expect(isOpenRouterError(failure)).toBe(true);
    expect(failure).toMatchObject({ kind, status, retryable });
  });

  test('a dead connection is a network failure worth retrying', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 }))
      .rejects.toMatchObject({ kind: 'network', retryable: true });
  });

  test('an aborted request is never retried', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });

    await expect(client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10, signal: controller.signal }))
      .rejects.toMatchObject({ kind: 'aborted', retryable: false });
  });

  test('the key never reaches the error message', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 401, message: `key ${API_KEY} is invalid` } }),
      { status: 401 },
    ));

    const failure: unknown = await client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 })
      .catch((error: unknown) => error);

    expect((failure as OpenRouterError).message).not.toContain(API_KEY);
    expect((failure as OpenRouterError).message).toContain('[redacted]');
  });
});

describe('chat without streaming', () => {
  test('returns the message, the model that answered, and usage', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      model: 'nex-agi/nex-n2.5-pro:free',
      choices: [{ message: { content: '{"name":"x"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    })));

    const result = await client(fetchImpl as unknown as typeof globalThis.fetch).chat({
      model: 'qwen/qwen3.8-27b:free',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 500,
      temperature: 0.2,
      schema: { name: 'project_files', schema: { type: 'object' } },
    });

    expect(result).toEqual({
      content: '{"name":"x"}',
      model: 'nex-agi/nex-n2.5-pro:free',
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 },
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(500);
    expect(body.temperature).toBe(0.2);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'project_files', strict: true, schema: { type: 'object' } },
    });
  });

  test('a 200 carrying an error object is still that error', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 429, message: 'temporarily rate-limited upstream' },
    })));

    await expect(client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 }))
      .rejects.toMatchObject({ kind: 'rateLimited', retryable: true });
  });

  test('a body that is not JSON is a bad response', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>gateway</html>'));

    await expect(client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 }))
      .rejects.toMatchObject({ kind: 'bad-response', retryable: false });
  });
});

describe('chat streaming', () => {
  const body = [
    ': OPENROUTER PROCESSING\n\n',
    deltaEvent('{"name":'),
    ': OPENROUTER PROCESSING\n\n',
    deltaEvent('"tiny ✅ app"}'),
    FINAL_EVENT,
    'data: [DONE]\n\n',
  ].join('');

  test.each([1, 3, 7, 64, 4096])('reassembles events split every %i bytes', async (size) => {
    const { result, onDelta } = await collect(byteStream(body, size));

    expect(result.content).toBe('{"name":"tiny ✅ app"}');
    expect(onDelta.mock.calls.map(([delta]) => delta)).toEqual(['{"name":', '"tiny ✅ app"}']);
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
    expect(result.model).toBe('a/model:free');
  });

  test('stops at [DONE] and ignores anything after it', async () => {
    const { result } = await collect(byteStream(
      `${deltaEvent('a')}data: [DONE]\n\n${deltaEvent('b')}`,
      5,
    ));

    expect(result.content).toBe('a');
  });

  test('accepts a last event with no trailing newline', async () => {
    const { result } = await collect(byteStream(deltaEvent('done').trimEnd(), 3));

    expect(result.content).toBe('done');
  });

  test('ignores a malformed event rather than losing the generation', async () => {
    const { result } = await collect(byteStream(`data: {not json}\n\n${deltaEvent('ok')}`, 9));

    expect(result.content).toBe('ok');
  });

  test('an error mid-stream keeps what had already arrived', async () => {
    const failure = await collect(byteStream(
      `${deltaEvent('{"files":[')}data: ${JSON.stringify({ error: { code: 429, message: 'upstream' } })}\n\n`,
      11,
    )).catch((error: unknown) => error as OpenRouterError);

    expect(failure).toMatchObject({ kind: 'rateLimited', retryable: true, partial: '{"files":[' });
  });

  test('a body with no stream is read whole', async () => {
    const { result } = await collect(new Response(`${deltaEvent('whole')}data: [DONE]\n\n`));

    expect(result.content).toBe('whole');
  });

  test('cancelling mid-stream reports the abort with the partial answer', async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode(deltaEvent('half')));
      },
      pull() {
        // The guard stopped the generation: the transport fails the read.
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      },
    });

    const failure = await client(vi.fn(async () => new Response(stream)) as unknown as typeof globalThis.fetch)
      .chat({
        model: 'a/model:free',
        messages: [],
        maxTokens: 10,
        signal: controller.signal,
        onDelta: vi.fn(),
      })
      .catch((error: unknown) => error) as OpenRouterError;

    expect(failure).toMatchObject({ kind: 'aborted', retryable: false, partial: 'half' });
  });

  test('asks for a stream only when a delta handler is given', async () => {
    const fetchImpl = vi.fn(async () => byteStream('data: [DONE]\n\n', 64));
    await client(fetchImpl as unknown as typeof globalThis.fetch).chat({
      model: 'a/model:free',
      messages: [],
      maxTokens: 10,
      onDelta: vi.fn(),
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).stream).toBe(true);
  });
});

describe('liveness while a model thinks', () => {
  function reasoningEvent(reasoning: string): string {
    return `data: ${JSON.stringify({ model: 'a/model:free', choices: [{ delta: { reasoning } }] })}\n\n`;
  }

  async function watch(response: Response, withDelta = true) {
    const onActivity = vi.fn();
    const onDelta = vi.fn();
    const result = await client(vi.fn(async () => response) as unknown as typeof globalThis.fetch).chat({
      model: 'a/model:free',
      messages: [],
      maxTokens: 100,
      onActivity,
      onDelta: withDelta ? onDelta : undefined,
    });
    return {
      result,
      onDelta,
      activity: onActivity.mock.calls.map(([item]) => item as { kind: string; bytes: number }),
    };
  }

  test('reports the keep-alives that arrive before any data line', async () => {
    const { result, activity } = await watch(byteStream([
      ': OPENROUTER PROCESSING\n\n',
      ': OPENROUTER PROCESSING\n\n',
      ': OPENROUTER PROCESSING\n\n',
      deltaEvent('{"files":'),
      'data: [DONE]\n\n',
    ].join(''), 9));

    expect(activity.map((item) => item.kind)).toEqual(['keepalive', 'keepalive', 'keepalive', 'content']);
    // The line itself, comment marker included — there is nothing else to size.
    expect(activity[0].bytes).toBe(': OPENROUTER PROCESSING'.length);
    expect(activity[3].bytes).toBe('{"files":'.length);
    expect(result.content).toBe('{"files":');
  });

  test.each([1, 5, 64])('counts each keep-alive once when split every %i bytes', async (size) => {
    const { activity } = await watch(byteStream(
      `: OPENROUTER PROCESSING\n\n: OPENROUTER PROCESSING\n\n${deltaEvent('a')}data: [DONE]\n\n`,
      size,
    ));

    expect(activity.filter((item) => item.kind === 'keepalive')).toHaveLength(2);
  });

  test('reports reasoning without letting it near the content', async () => {
    const { result, onDelta, activity } = await watch(byteStream(
      `${reasoningEvent('Let me think about the plan')}${deltaEvent('{"name":"x"}')}data: [DONE]\n\n`,
      13,
    ));

    expect(activity).toEqual([
      { kind: 'reasoning', bytes: 'Let me think about the plan'.length },
      { kind: 'content', bytes: '{"name":"x"}'.length },
    ]);
    // The scanner downstream depends on this: deltas are content and nothing else.
    expect(onDelta.mock.calls.map(([delta]) => delta)).toEqual(['{"name":"x"}']);
    expect(result.content).toBe('{"name":"x"}');
  });

  test('reads reasoning_content too, which is the same field renamed', async () => {
    const event = `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'hmm' } }] })}\n\n`;
    const { result, activity } = await watch(byteStream(`${event}data: [DONE]\n\n`, 32));

    expect(activity).toEqual([{ kind: 'reasoning', bytes: 3 }]);
    expect(result.content).toBe('');
  });

  test('is enough on its own to stream, with no delta handler at all', async () => {
    const fetchImpl = vi.fn(async () => byteStream(
      `: OPENROUTER PROCESSING\n\n${deltaEvent('hello')}data: [DONE]\n\n`,
      7,
    ));
    const onActivity = vi.fn();
    const result = await client(fetchImpl as unknown as typeof globalThis.fetch).chat({
      model: 'a/model:free',
      messages: [],
      maxTokens: 10,
      onActivity,
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).stream).toBe(true);
    expect(onActivity.mock.calls.map(([item]) => (item as { kind: string }).kind))
      .toEqual(['keepalive', 'content']);
    expect(result.content).toBe('hello');
  });

  test('says nothing after an error, which still carries the partial answer', async () => {
    const failure = await watch(byteStream(
      `: OPENROUTER PROCESSING\n\n${deltaEvent('{"files":[')}data: ${JSON.stringify({ error: { code: 429, message: 'upstream' } })}\n\n`,
      16,
    )).catch((error: unknown) => error as OpenRouterError);

    expect(failure).toMatchObject({ kind: 'rateLimited', partial: '{"files":[' });
  });
});

describe('with no key of its own', () => {
  test('sets no Authorization header — the proxy attaches the server\'s', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    await proxied(fetchImpl as unknown as typeof globalThis.fetch).listFreeModels();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('/api/ai/v1/models');
    expect(headers.has('Authorization')).toBe(false);
    // Attribution is harmless and still sent.
    expect(headers.get('HTTP-Referer')).toBe('https://app.test');
    expect(headers.get('X-Title')).toBe('Collaborative Code Editor');
  });

  test('sets no Authorization on a chat either', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
    })));

    await proxied(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });
});

describe("auth: 'session' — the messages name the session, not a key", () => {
  test('a 401 asks the user to sign in again', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":401,"message":"no session"}}', { status: 401 }));

    const failure = await proxied(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 })
      .catch((error: unknown) => error) as OpenRouterError;

    expect(failure).toMatchObject({ kind: 'auth', status: 401, retryable: false });
    expect(failure.message).toContain('Your session has expired. Sign in again to use the assistant.');
    expect(failure.message).not.toMatch(/API key/i);
  });

  test('a 403 blames the account, not a key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":403}}', { status: 403 }));

    const failure = await proxied(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 })
      .catch((error: unknown) => error) as OpenRouterError;

    expect(failure).toMatchObject({ kind: 'forbidden', worthAnotherModel: true });
    expect(failure.message).toBe('This account is not allowed to use that model.');
  });

  test('a 401 arriving mid-stream says the same thing, keeping the partial', async () => {
    const fetchImpl = vi.fn(async () => byteStream(
      `${deltaEvent('{"files":[')}data: ${JSON.stringify({ error: { code: 'authentication_error' } })}\n\n`,
      9,
    ));

    const failure = await proxied(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10, onDelta: vi.fn() })
      .catch((error: unknown) => error) as OpenRouterError;

    expect(failure).toMatchObject({ kind: 'auth', partial: '{"files":[' });
    expect(failure.message).toContain('Your session has expired.');
  });

  test('everything else is worded exactly as it always was', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":429}}', { status: 429 }));

    const failure = await proxied(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 })
      .catch((error: unknown) => error) as OpenRouterError;

    expect(failure).toMatchObject({ kind: 'rateLimited', retryable: true });
    expect(failure.message).toBe('That model is rate-limited right now.');
  });

  test('a refused session is still an answer from verifyKey, not a throw', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":401}}', { status: 401 }));

    await expect(proxied(fetchImpl as unknown as typeof globalThis.fetch).verifyKey())
      .resolves.toEqual({ valid: false, label: null, freeTier: false });
  });
});

describe('the default is still the key wording', () => {
  test('a 401 blames the key when one was given', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":401}}', { status: 401 }));

    const failure = await client(fetchImpl as unknown as typeof globalThis.fetch)
      .chat({ model: 'a/model:free', messages: [], maxTokens: 10 })
      .catch((error: unknown) => error) as OpenRouterError;

    expect(failure.message).toBe('OpenRouter rejected this API key.');
  });
});
