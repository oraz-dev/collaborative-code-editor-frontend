/**
 * The OpenRouter API, as this app speaks it.
 *
 * Two ways in, one client. In this app the browser calls our own
 * `/api/ai/v1/...` proxy, which checks the session and attaches the key held
 * in the server's environment — so no `apiKey` is passed here and no
 * `Authorization` header is set by this module at all (`auth: 'session'`,
 * which is also what the 401/403 messages then talk about). Given an
 * `apiKey` it talks to openrouter.ai directly, which is what the tests do.
 *
 * Either way nothing here logs, returns or embeds a credential: every message
 * that could carry one goes through `redact` first, because these messages end
 * up on screen and in bug reports.
 */

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Metadata calls are small; a hung one would freeze the settings dialog. */
const METADATA_TIMEOUT_MS = 20_000;

/** Default attribution sent to OpenRouter, overridable per client. */
const APP_TITLE = 'Collaborative Code Editor';
const APP_URL = 'https://localhost';

/**
 * - `auth` (401): the key is wrong or revoked — asking again will not help.
 * - `payment` (402): the account needs credit, even for a paid-tier fallback.
 * - `forbidden` (403): this key may not use that model (some free models are
 *   account-gated and answer 403 for everyone else).
 * - `rateLimited` (429): free models are shared and say this a lot; the next
 *   model in the chain is the answer, not a tighter loop.
 * - `server` (5xx) and `network`: worth another attempt.
 * - `aborted`: the user or a guard stopped it; never retried.
 * - `bad-response`: a 2xx whose body is not what the API documents.
 */
export type OpenRouterErrorKind =
  | 'auth'
  | 'payment'
  | 'forbidden'
  | 'rateLimited'
  | 'server'
  | 'network'
  | 'aborted'
  | 'bad-response';

interface OpenRouterErrorParams {
  message: string;
  kind: OpenRouterErrorKind;
  status?: number;
  /** Content already streamed when the failure hit, so it is not thrown away. */
  partial?: string;
}

/** Anything shaped like an OpenRouter key, wherever it came from. */
const KEY_LIKE = /\bsk-or-[A-Za-z0-9._~+/-]{4,}/g;

/**
 * Keeps key material out of anything a human or a log will ever see.
 *
 * An upstream error body could quote back the Authorization header, and a
 * caller could pass the key into a message by accident; neither should end up
 * rendered in a toast.
 */
export function redact(text: string, secret?: string): string {
  const withoutSecret = secret && secret.length >= 8 ? text.split(secret).join('[redacted]') : text;
  return withoutSecret.replace(KEY_LIKE, '[redacted]');
}

export class OpenRouterError extends Error {
  readonly kind: OpenRouterErrorKind;

  readonly status: number;

  readonly partial: string;

  constructor({ message, kind, status = 0, partial = '' }: OpenRouterErrorParams) {
    super(redact(message));
    this.name = 'OpenRouterError';
    this.kind = kind;
    this.status = status;
    this.partial = partial;
  }

  /** Whether trying again — the same model or the next one — could work. */
  get retryable(): boolean {
    return this.kind === 'rateLimited' || this.kind === 'server' || this.kind === 'network';
  }

  /** Whether another model in the chain could succeed where this one failed. */
  get worthAnotherModel(): boolean {
    return this.retryable || this.kind === 'forbidden';
  }
}

export function isOpenRouterError(error: unknown): error is OpenRouterError {
  return error instanceof OpenRouterError;
}

function kindForStatus(status: number): OpenRouterErrorKind {
  if (status === 401) return 'auth';
  if (status === 402) return 'payment';
  if (status === 403) return 'forbidden';
  if (status === 408 || status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  return 'bad-response';
}

/** Which credential was refused, and so which sentence a 401/403 deserves. */
export type OpenRouterAuthMode = 'key' | 'session';

type Messages = Record<OpenRouterErrorKind, string>;

const DEFAULT_MESSAGES: Messages = {
  auth: 'OpenRouter rejected this API key.',
  payment: 'This OpenRouter account needs credit before it can run that model.',
  forbidden: 'This key is not allowed to use that model.',
  rateLimited: 'That model is rate-limited right now.',
  server: 'OpenRouter had a server error.',
  network: 'Could not reach OpenRouter. Check your connection.',
  aborted: 'Generation cancelled.',
  'bad-response': 'OpenRouter sent a response this app could not read.',
};

/**
 * The same failures, told to someone who has no key to fix.
 *
 * Behind the proxy a 401 is our own server saying the session is gone, and a
 * 403 is that session not being allowed the model — so "check your API key"
 * would send the user looking for something that does not exist.
 */
const SESSION_MESSAGES: Messages = {
  ...DEFAULT_MESSAGES,
  auth: 'Your session has expired. Sign in again to use the assistant.',
  forbidden: 'This account is not allowed to use that model.',
};

function messagesFor(auth: OpenRouterAuthMode): Messages {
  return auth === 'session' ? SESSION_MESSAGES : DEFAULT_MESSAGES;
}

/**
 * OpenAI-compatible providers proxied through OpenRouter send a word where the
 * API documents a number, so `"rate_limit_exceeded"` has to mean 429 — or the
 * chain would treat the one failure it exists for as unreadable and stop.
 */
const STRING_CODES: Record<string, number> = {
  rate_limit_exceeded: 429,
  requests_limit_reached: 429,
  tokens_limit_reached: 429,
  quota_exceeded: 429,
  insufficient_quota: 402,
  billing_hard_limit_reached: 402,
  invalid_api_key: 401,
  authentication_error: 401,
  permission_denied: 403,
  server_error: 500,
  internal_server_error: 500,
  service_unavailable: 503,
  timeout: 408,
};

interface ErrorPayload {
  /** The HTTP-style code, or 0 when there was none to read. */
  code: number;
  /** A code that was there but meant nothing here — a real upstream failure. */
  unmapped: boolean;
  message: string;
}

/** `429`, `"429"` or `"rate_limit_exceeded"`, all of which arrive in the wild. */
function readCode(code: unknown): { code: number; unmapped: boolean } {
  if (typeof code === 'number') return { code: Number.isFinite(code) ? code : 0, unmapped: false };
  if (typeof code !== 'string' || !code.trim()) return { code: 0, unmapped: false };

  const trimmed = code.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric !== 0) return { code: numeric, unmapped: false };

  const known = STRING_CODES[trimmed.toLowerCase()];
  // An unrecognised word is still the provider saying it failed, so it must not
  // become `bad-response`, which would end the walk down the chain.
  return known ? { code: known, unmapped: false } : { code: 0, unmapped: true };
}

/** `{ error: { code, message } }`, which OpenRouter sends with 4xx *and* 200. */
function readErrorPayload(payload: unknown): ErrorPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const { error } = payload as { error?: unknown };
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const read = readCode(code);
  return {
    code: read.code,
    unmapped: read.unmapped,
    message: typeof message === 'string' ? message : '',
  };
}

function errorFromStatus(status: number, body: string, messages: Messages): OpenRouterError {
  let detail = '';
  try {
    detail = readErrorPayload(JSON.parse(body))?.message ?? '';
  } catch {
    // A non-JSON body (an HTML gateway page) tells the user nothing useful.
  }
  const kind = kindForStatus(status);
  return new OpenRouterError({
    kind,
    status,
    message: detail ? `${messages[kind]} ${detail}` : messages[kind],
  });
}

/** A 200 that carries `error` instead of a completion — how 429s often arrive. */
function errorFromPayload(payload: unknown, messages: Messages, partial = ''): OpenRouterError | null {
  const found = readErrorPayload(payload);
  if (!found) return null;
  // No code at all is a body this app cannot read; a code it could not place is
  // still a failure the provider reported, so the next model gets a turn.
  const kind = found.code ? kindForStatus(found.code) : found.unmapped ? 'server' : 'bad-response';
  return new OpenRouterError({
    kind,
    status: found.code,
    partial,
    message: found.message ? `${messages[kind]} ${found.message}` : messages[kind],
  });
}

function errorFromThrown(
  error: unknown,
  messages: Messages,
  signal?: AbortSignal,
  partial = '',
): OpenRouterError {
  if (isOpenRouterError(error)) return error;
  if (signal?.aborted) {
    return new OpenRouterError({ kind: 'aborted', message: messages.aborted, partial });
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new OpenRouterError({ kind: 'network', message: 'OpenRouter took too long to answer.', partial });
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new OpenRouterError({ kind: 'aborted', message: messages.aborted, partial });
  }
  return new OpenRouterError({ kind: 'network', message: messages.network, partial });
}

export interface FreeModel {
  id: string;
  /** Human name from the catalogue, e.g. "Qwen: Qwen3.8 27B (free)". */
  label: string;
  contextLength: number;
  /** Largest completion the provider will produce, which caps `maxTokens`. */
  maxOutput: number;
  /** Whether the model honours `response_format: json_schema` with `strict`. */
  structured: boolean;
}

export interface KeyInfo {
  valid: boolean;
  /** The key's own label in OpenRouter, never the key. */
  label: string | null;
  freeTier: boolean;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface JsonSchemaSpec {
  /** Schema name OpenRouter echoes back; keep it short and stable. */
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * What a stream did, as opposed to what it said.
 *
 * - `keepalive`: a `: OPENROUTER PROCESSING` comment line. It carries nothing,
 *   which is exactly the point — it is the connection saying it is still there
 *   while a model queues or reasons.
 * - `reasoning`: a `delta.reasoning` chunk. Never content (see `onDelta`), but
 *   a reasoning-heavy model can spend minutes here before its first word.
 * - `content`: a text delta, reported alongside `onDelta` so one callback can
 *   answer "is anything happening?" for all three.
 */
export type StreamActivityKind = 'keepalive' | 'reasoning' | 'content';

export interface StreamActivity {
  kind: StreamActivityKind;
  /** Characters in this chunk; for a keep-alive, the length of the line. */
  bytes: number;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** Turns on strict JSON; only send it to a model whose `structured` is true. */
  schema?: JsonSchemaSpec;
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  /**
   * Present => the response is streamed and each text delta is handed over.
   *
   * Content only, and deliberately so: the JSON scanner downstream treats what
   * it is given as the answer, so reasoning must never reach it.
   */
  onDelta?: (delta: string) => void;
  /**
   * Every sign of life, content or not — also enough on its own to stream.
   *
   * The four-minute silence before a reasoning model's first byte is not a
   * hang, but nothing said so: keep-alives and reasoning were both dropped
   * here. This reports them without widening what `onDelta` means.
   */
  onActivity?: (activity: StreamActivity) => void;
}

export interface ChatResult {
  content: string;
  /** The model that actually answered — OpenRouter may route elsewhere. */
  model: string;
  /** `stop`, or `length` when the model ran into `maxTokens` mid-answer. */
  finishReason: string | null;
  usage: ChatUsage | null;
}

export interface OpenRouterClientOptions {
  /**
   * An OpenRouter key, for a direct call to openrouter.ai. Absent when the
   * request goes through this app's proxy: the server holds the key and
   * attaches it, so no `Authorization` header is set here at all.
   */
  apiKey?: string;
  /**
   * Which credential the caller is presenting, and so what a 401 or a 403
   * means. `'key'` (the default) blames the API key; `'session'` blames the
   * user's sign-in, which is the only thing they can act on behind the proxy.
   */
  auth?: OpenRouterAuthMode;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  /** `HTTP-Referer` — OpenRouter's attribution header. */
  referer?: string;
  /** `X-Title` — the app name shown on the user's OpenRouter activity page. */
  title?: string;
}

export interface OpenRouterClient {
  listFreeModels(signal?: AbortSignal): Promise<FreeModel[]>;
  verifyKey(signal?: AbortSignal): Promise<KeyInfo>;
  chat(request: ChatRequest): Promise<ChatResult>;
}

/** Caller's signal plus a deadline, on runtimes that can combine them. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  try {
    const timeout = AbortSignal.timeout(ms);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  } catch {
    // No `AbortSignal.any` here: the caller's own signal still cancels.
    return signal;
  }
}

interface ModelDto {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  top_provider?: { max_completion_tokens?: unknown };
  supported_parameters?: unknown;
}

const FREE_SUFFIX = ':free';

function toFreeModel(dto: ModelDto): FreeModel | null {
  if (typeof dto.id !== 'string' || !dto.id.endsWith(FREE_SUFFIX)) return null;

  const contextLength = typeof dto.context_length === 'number' ? dto.context_length : 0;
  const maxCompletion = dto.top_provider?.max_completion_tokens;
  const supported = Array.isArray(dto.supported_parameters) ? dto.supported_parameters : [];

  return {
    id: dto.id,
    label: typeof dto.name === 'string' ? dto.name : dto.id,
    contextLength,
    // Providers that do not publish a completion cap allow the whole context.
    maxOutput: typeof maxCompletion === 'number' ? maxCompletion : contextLength,
    structured: supported.includes('structured_outputs'),
  };
}

export function createOpenRouterClient(options: OpenRouterClientOptions): OpenRouterClient {
  const {
    apiKey,
    auth = 'key',
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    baseUrl = OPENROUTER_BASE_URL,
    title = APP_TITLE,
  } = options;

  const referer = options.referer ?? globalThis.location?.origin ?? APP_URL;
  // Not `messages`: `chat` destructures a `messages` of its own out of the
  // request, and the shadow silently emptied every error message.
  const wording = messagesFor(auth);

  /** Never widened: a message with the key in it must not reach a screen. */
  const clean = (text: string): string => redact(text, apiKey);

  function headers(json: boolean): Headers {
    // Attribution only. With no key of our own there is no `Authorization` to
    // set: the proxy adds the server's, and a header set here would be
    // overwritten anyway. The referer and title stay — they are harmless, they
    // are not credentials, and the proxy passing its own through costs nothing.
    const result = new Headers({
      'HTTP-Referer': referer,
      'X-Title': title,
    });
    if (apiKey) result.set('Authorization', `Bearer ${apiKey}`);
    if (json) result.set('Content-Type', 'application/json');
    return result;
  }

  async function getJson<T>(path: string, signal: AbortSignal | undefined): Promise<T> {
    const merged = withTimeout(signal, METADATA_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method: 'GET', headers: headers(false), signal: merged });
    } catch (error) {
      throw errorFromThrown(error, wording, signal);
    }

    const body = await response.text().catch(() => '');
    if (!response.ok) throw errorFromStatus(response.status, clean(body), wording);

    try {
      const payload: unknown = JSON.parse(body);
      const failure = errorFromPayload(payload, wording);
      // Re-wrapped, exactly as `readWhole` and the stream handler do: a 200 body
      // carrying an error can quote the Authorization header back, and these
      // messages are rendered as text in Settings.
      if (failure) {
        throw new OpenRouterError({
          kind: failure.kind,
          status: failure.status,
          message: clean(failure.message),
        });
      }
      return payload as T;
    } catch (error) {
      if (isOpenRouterError(error)) throw error;
      throw new OpenRouterError({ kind: 'bad-response', message: wording['bad-response'] });
    }
  }

  return {
    async listFreeModels(signal) {
      const payload = await getJson<{ data?: unknown }>('/models', signal);
      const list = Array.isArray(payload.data) ? (payload.data as ModelDto[]) : [];
      return list
        .map(toFreeModel)
        .filter((model): model is FreeModel => model !== null);
    },

    async verifyKey(signal) {
      try {
        const payload = await getJson<{ data?: Record<string, unknown> }>('/key', signal);
        const data = payload.data ?? {};
        // The label is the key's name in OpenRouter, not the key — but it is
        // free text that this app renders, and only the key's owner can be sure
        // it is not the key itself, so it is redacted like everything else.
        const label = typeof data.label === 'string' && data.label ? clean(data.label) : null;
        return {
          valid: true,
          label,
          freeTier: data.is_free_tier === true,
        };
      } catch (error) {
        // "Your key is not valid" is the answer the Test button asked for, not
        // a failure of the test; anything else really did go wrong.
        if (isOpenRouterError(error) && (error.kind === 'auth' || error.kind === 'forbidden')) {
          return { valid: false, label: null, freeTier: false };
        }
        throw error;
      }
    },

    async chat(request) {
      const { model, messages, schema, maxTokens, temperature, signal, onDelta, onActivity } = request;
      // Either callback is a reason to stream: a caller that only wants to know
      // the connection is alive still needs the events that prove it.
      const streaming = typeof onDelta === 'function' || typeof onActivity === 'function';

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: maxTokens,
        stream: streaming,
      };
      if (typeof temperature === 'number') body.temperature = temperature;
      if (schema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: schema.name, strict: true, schema: schema.schema },
        };
      }

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        throw errorFromThrown(error, wording, signal);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw errorFromStatus(response.status, clean(text), wording);
      }

      return streaming
        ? readStream(response, { fallbackModel: model, onDelta, onActivity, signal, clean, messages: wording })
        : readWhole(response, model, clean, wording);
    },
  };
}

async function readWhole(
  response: Response,
  fallbackModel: string,
  clean: (text: string) => string,
  messages: Messages,
): Promise<ChatResult> {
  const text = await response.text().catch(() => '');
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new OpenRouterError({ kind: 'bad-response', message: messages['bad-response'] });
  }

  const failure = errorFromPayload(payload, messages);
  if (failure) {
    throw new OpenRouterError({
      kind: failure.kind,
      status: failure.status,
      message: clean(failure.message),
    });
  }

  const { choices, model, usage } = payload as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
    model?: unknown;
    usage?: unknown;
  };
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const content = typeof first?.message?.content === 'string' ? first.message.content : '';

  if (!first) {
    throw new OpenRouterError({ kind: 'bad-response', message: 'OpenRouter answered with no choices.' });
  }

  return {
    content,
    model: typeof model === 'string' ? model : fallbackModel,
    finishReason: typeof first.finish_reason === 'string' ? first.finish_reason : null,
    usage: readUsage(usage),
  };
}

function readUsage(usage: unknown): ChatUsage | null {
  if (!usage || typeof usage !== 'object') return null;
  const { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total } = usage as Record<string, unknown>;
  if (typeof prompt !== 'number' && typeof completion !== 'number') return null;
  return {
    promptTokens: typeof prompt === 'number' ? prompt : 0,
    completionTokens: typeof completion === 'number' ? completion : 0,
    totalTokens: typeof total === 'number' ? total : 0,
  };
}

interface StreamOptions {
  fallbackModel: string;
  onDelta?: (delta: string) => void;
  onActivity?: (activity: StreamActivity) => void;
  signal?: AbortSignal;
  clean: (text: string) => string;
  messages: Messages;
}

const DATA_PREFIX = 'data:';
const DONE = '[DONE]';

/**
 * Reads an SSE completion.
 *
 * Three things make this more than "split on newlines": the transport hands
 * over arbitrary byte ranges, so an event can arrive in three reads and a
 * multi-byte character can straddle two of them; OpenRouter sends
 * `: OPENROUTER PROCESSING` comment lines as keep-alives while a free model
 * queues; and the stream can carry an `error` object *after* a 200, which is
 * how an upstream rate limit usually shows up mid-generation.
 *
 * The keep-alives and the reasoning deltas are still not content — but they are
 * not nothing either, and `onActivity` is where they go.
 */
async function readStream(response: Response, options: StreamOptions): Promise<ChatResult> {
  const { fallbackModel, onDelta, onActivity, signal, clean, messages } = options;

  let content = '';
  let model = fallbackModel;
  let finishReason: string | null = null;
  let usage: ChatUsage | null = null;
  let buffer = '';

  const handleEvent = (data: string): boolean => {
    if (data === DONE) return true;

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      // A malformed event is not worth failing a whole generation over.
      return false;
    }

    const failure = errorFromPayload(payload, messages, content);
    if (failure) {
      throw new OpenRouterError({
        kind: failure.kind,
        status: failure.status,
        message: clean(failure.message),
        partial: content,
      });
    }

    const chunk = payload as {
      model?: unknown;
      usage?: unknown;
      choices?: Array<{
        delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown };
        finish_reason?: unknown;
      }>;
    };
    if (typeof chunk.model === 'string') model = chunk.model;
    const parsedUsage = readUsage(chunk.usage);
    if (parsedUsage) usage = parsedUsage;

    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason;

    // `delta.reasoning` is still kept out of the content: reasoning-heavy free
    // models emit far more of it than answer, and none of it is part of the
    // JSON. It is reported as activity, which is all it is good for.
    // `reasoning_content` is the same field under the name some OpenAI-
    // compatible providers use for it.
    const thought = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content;
    if (typeof thought === 'string' && thought.length > 0) {
      onActivity?.({ kind: 'reasoning', bytes: thought.length });
    }

    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      content += delta;
      // Before `onDelta`, so a handler that stops the stream has still been
      // credited with what arrived.
      onActivity?.({ kind: 'content', bytes: delta.length });
      onDelta?.(delta);
    }
    return false;
  };

  /** Consumes whole lines, leaving any partial last line in the buffer. */
  const drain = (final: boolean): boolean => {
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.startsWith(':')) {
        // The whole point of a keep-alive: nothing to parse, everything to
        // report. This is the only proof of life a queued model gives.
        onActivity?.({ kind: 'keepalive', bytes: line.length });
      } else if (line) {
        const trimmed = line.startsWith(DATA_PREFIX) ? line.slice(DATA_PREFIX.length).trim() : '';
        if (trimmed && handleEvent(trimmed)) return true;
      }
      newline = buffer.indexOf('\n');
    }

    // The last event may not be newline-terminated when the body ends.
    if (final && buffer.trim() && !buffer.trimStart().startsWith(':')) {
      const line = buffer.trim();
      buffer = '';
      if (line.startsWith(DATA_PREFIX)) return handleEvent(line.slice(DATA_PREFIX.length).trim());
    }
    return false;
  };

  const body = response.body;

  // Some environments (and a `Response` built from a string in tests) expose no
  // readable stream; the whole body is then one "chunk", which parses the same.
  if (!body) {
    try {
      buffer = await response.text();
    } catch (error) {
      throw errorFromThrown(error, messages, signal, content);
    }
    drain(true);
    return { content, model, finishReason, usage };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        drain(true);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      if (drain(false)) break;
    }
  } catch (error) {
    throw errorFromThrown(error, messages, signal, content);
  } finally {
    // Stops the download when a guard cut the generation short.
    reader.cancel().catch(() => undefined);
  }

  return { content, model, finishReason, usage };
}
