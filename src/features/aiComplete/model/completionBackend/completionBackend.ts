import { AI_PROXY_BASE_URL, DEFAULT_MODEL, type ChatMessage } from '@/features/aiProjects';

/**
 * The two places a completion can come from, and how to tell whether the fast
 * one exists today.
 *
 * Both are this app's own origin. `/api/ai/fast/v1` forwards to Groq and
 * `/api/ai/v1` forwards to OpenRouter; in both cases the provider key is held
 * by the server and attached there, so nothing in this bundle has a credential
 * and the only thing the browser presents is its session.
 */

/** Same origin, session-checked, key attached by the server. Groq behind it. */
export const FAST_PROXY_BASE_URL = '/api/ai/fast/v1';

/**
 * Which backend answered, or is being asked.
 *
 * `fast` is the only one allowed to run while someone types; `onDemand` is a
 * free OpenRouter tier of fifty requests a day, so it runs when asked and
 * never on its own.
 */
export type CompletionBackend = 'fast' | 'onDemand';

/**
 * What the fast route is today.
 *
 * - `available`: it listed models, so there is a key behind it.
 * - `unconfigured`: the route is there and has no provider key. This is the
 *   state the site is actually in right now: the proxy forwards, Groq refuses,
 *   and the answer comes back as a 401 whose body says `invalid_api_key`.
 * - `unauthenticated`: our own proxy refused the session, not the provider.
 * - `offline`: nothing answered.
 */
export type FastBackendState = 'available' | 'unconfigured' | 'unauthenticated' | 'offline';

/**
 * The completion models worth asking for, best first.
 *
 * Small, fast instruction-tuned models only: a completion is thirty tokens
 * under a deadline of a few hundred milliseconds, so speed is the ranking. The
 * list is matched as substrings against whatever `/models` lists, because
 * Groq's ids carry dates and revisions that change without notice.
 *
 * Nothing that cannot write code is listed, and `EXCLUDED_MODELS` drops the
 * rest: speech models (whisper, tts), safety classifiers (guard) and embedders
 * all appear in the same catalogue and none of them completes code.
 */
export const FAST_MODEL_PREFERENCES = [
  // Ordered by the throughput Groq publishes for each, because a completion is
  // thirty tokens and the user is waiting: gpt-oss-20b ~1000 tok/s,
  // llama-3.1-8b-instant ~560 tok/s, gpt-oss-120b ~500 tok/s.
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'qwen3-32b',
  'llama-3.3-70b-versatile',
  'gemma2-9b-it',
];

/** Models in the same catalogue that cannot complete code, whatever their size. */
export const EXCLUDED_MODELS = /whisper|tts|audio|guard|safety|moderation|embed|rerank|vision/i;

/**
 * Used when `/models` cannot be read — an unavailable list must not stop a
 * completion the user explicitly asked for. The smallest model in the
 * preference list, because a wrong guess should at least be a fast one.
 */
export const FAST_MODEL_FALLBACK = 'llama-3.1-8b-instant';

/** The provider's own words for "the key I was given is not a key". */
const PROVIDER_KEY_REFUSAL = /invalid[_ ]api[_ ]key|no api key|api key not found|missing api key/i;

export class CompletionError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'CompletionError';
    this.status = status;
  }
}

function baseUrl(backend: CompletionBackend): string {
  return backend === 'fast' ? FAST_PROXY_BASE_URL : AI_PROXY_BASE_URL;
}

/** `{ data: [{ id }] }`, the OpenAI-compatible shape both routes answer with. */
function readModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const { data } = payload as { data?: unknown };
  if (!Array.isArray(data)) return [];

  return data
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * The best listed model, or the fallback.
 *
 * Preference order wins over catalogue order: the list is ranked by how fast
 * each model answers, which is not something the catalogue knows.
 */
export function pickFastModel(ids: string[]): string {
  const usable = ids.filter((id) => !EXCLUDED_MODELS.test(id));

  for (const preference of FAST_MODEL_PREFERENCES) {
    const match = usable.find((id) => id.includes(preference));
    if (match) return match;
  }
  // Nothing recognised, but something answered: an unknown small model beats
  // a hardcoded id the account may not have at all.
  return usable[0] ?? FAST_MODEL_FALLBACK;
}

export interface FastProbe {
  state: FastBackendState;
  /** The model ids the route listed, empty unless the state is `available`. */
  models: string[];
}

/**
 * Asks the fast route once what it is, and reads the answer carefully.
 *
 * The distinction that matters is between "this app has no fast provider key"
 * and "you are signed out", because only the second is the user's to fix and
 * only the first is the state this site is in. They arrive as the same status,
 * so the body decides: a provider refusing the key it was handed says
 * `invalid_api_key`, while our own proxy refusing a session does not — and a
 * session that has really ended fails on `/api/ai/v1` as well, where the
 * assistant already reports it. A 401 here alone is therefore never reported
 * as a session problem.
 */
export async function probeFastBackend(fetchImpl: typeof fetch): Promise<FastProbe> {
  let response: Response;
  try {
    response = await fetchImpl(`${FAST_PROXY_BASE_URL}/models`, { method: 'GET' });
  } catch {
    // Offline, blocked, or the origin is unreachable. Not a verdict on the key.
    return { state: 'offline', models: [] };
  }

  const body = await response.text().catch(() => '');

  if (response.ok) {
    try {
      return { state: 'available', models: readModelIds(JSON.parse(body)) };
    } catch {
      // A 200 that is not the catalogue: the route answers, so it is there,
      // but nothing can be chosen from it. The fallback model covers this.
      return { state: 'available', models: [] };
    }
  }

  if (response.status === 401 || response.status === 403) {
    return { state: PROVIDER_KEY_REFUSAL.test(body) ? 'unconfigured' : 'unauthenticated', models: [] };
  }

  // No such route on this deployment: there is no fast backend to configure.
  if (response.status === 404) return { state: 'unconfigured', models: [] };

  return { state: 'offline', models: [] };
}

export interface CompletionRequest {
  backend: CompletionBackend;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  /** Defaults to the fast fallback, or to the assistant's own default model. */
  model?: string;
  fetchImpl: typeof fetch;
}

function readContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const { choices } = payload as { choices?: unknown };
  if (!Array.isArray(choices) || choices.length === 0) return '';

  const first = choices[0] as { message?: { content?: unknown }; text?: unknown };
  if (typeof first?.message?.content === 'string') return first.message.content;
  return typeof first?.text === 'string' ? first.text : '';
}

/** A message out of an error body, so a failure says what actually happened. */
function readErrorMessage(body: string): string {
  try {
    const payload: unknown = JSON.parse(body);
    const error = (payload as { error?: { message?: unknown } }).error;
    if (error && typeof error.message === 'string') return error.message;
  } catch {
    // An HTML gateway page, which tells the user nothing worth showing.
  }
  return '';
}

/**
 * One completion, not streamed.
 *
 * Streaming would only matter for an answer long enough to read as it
 * arrives; a completion is one line, and the ghost text cannot be drawn until
 * it is whole anyway. `temperature` is low deliberately — a completion should
 * be the obvious continuation, not an interesting one.
 */
export async function requestCompletion(request: CompletionRequest): Promise<string> {
  const { backend, messages, maxTokens, signal, fetchImpl } = request;
  const model = request.model || (backend === 'fast' ? FAST_MODEL_FALLBACK : DEFAULT_MODEL);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl(backend)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
        stream: false,
      }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new CompletionError('Completion cancelled.');
    throw new CompletionError(error instanceof Error ? error.message : 'Could not reach the completion service.');
  }

  const body = await response.text().catch(() => '');

  if (!response.ok) {
    const detail = readErrorMessage(body);
    throw new CompletionError(detail || `The completion service answered ${response.status}.`, response.status);
  }

  try {
    const payload: unknown = JSON.parse(body);
    // A 200 carrying `error` instead of a choice: how a rate limit usually
    // arrives from a free tier.
    const detail = readErrorMessage(body);
    if (detail && readContent(payload).length === 0) throw new CompletionError(detail);
    return readContent(payload);
  } catch (error) {
    if (error instanceof CompletionError) throw error;
    throw new CompletionError('The completion service sent an answer this app could not read.');
  }
}
