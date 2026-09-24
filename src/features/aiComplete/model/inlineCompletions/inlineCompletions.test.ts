import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CompleteSettings } from '../completeSettings/completeSettings';
import type { FastBackendState } from '../completionBackend/completionBackend';
import { createCompletionCache, type CompletionCache } from '../completionCache/completionCache';
import {
  createCompletionStatusStore,
  createInlineCompletionsProvider,
  IDLE_DEBOUNCE_MS,
  isMidWord,
  lineTailBlocks,
  type CompletionModel,
  type CompletionPosition,
  type CompletionStatusStore,
  type CompletionToken,
} from './inlineCompletions';

/** Just the four members the provider asks a Monaco model for. */
function fakeModel(text: string): CompletionModel {
  const lines = text.split('\n');
  return {
    getValue: () => text,
    getLineContent: (lineNumber) => lines[lineNumber - 1] ?? '',
    getOffsetAt: ({ lineNumber, column }) => (
      lines.slice(0, lineNumber - 1).reduce((total, line) => total + line.length + 1, 0) + column - 1
    ),
  };
}

interface FakeToken extends CompletionToken {
  cancel(): void;
}

function fakeToken(): FakeToken {
  const listeners = new Set<() => void>();
  const token: FakeToken = {
    isCancellationRequested: false,
    onCancellationRequested(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    cancel() {
      token.isCancellationRequested = true;
      listeners.forEach((listener) => listener());
    },
  };
  return token;
}

const AS_YOU_TYPE: CompleteSettings = { mode: 'asYouType', singleLine: true };

interface Harness {
  settings: CompleteSettings;
  backend: FastBackendState;
  selection: boolean;
  cache: CompletionCache;
  status: CompletionStatusStore;
  send: ReturnType<typeof vi.fn>;
  signals: AbortSignal[];
}

/** A request that never answers until the signal it was given is aborted. */
function neverAnswers(signal: AbortSignal): Promise<string> {
  return new Promise<string>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

function harness(answer: string | ((signal: AbortSignal) => Promise<string>) = 'a + b;') {
  const state: Harness = {
    settings: AS_YOU_TYPE,
    backend: 'available',
    selection: false,
    cache: createCompletionCache(),
    status: createCompletionStatusStore(),
    send: vi.fn(),
    signals: [],
  };

  state.send.mockImplementation(({ signal }: { signal: AbortSignal }) => {
    state.signals.push(signal);
    return typeof answer === 'function' ? answer(signal) : Promise.resolve(answer);
  });

  const provider = createInlineCompletionsProvider({
    readSettings: () => state.settings,
    readBackend: () => state.backend,
    readFilePath: () => 'src/App.ts',
    hasSelection: () => state.selection,
    send: state.send as never,
    cache: state.cache,
    status: state.status,
  });

  // The same object the provider reads through, not a copy: a test that
  // changes `backend` or `selection` must change what the provider sees.
  return Object.assign(state, { provider });
}

const LINE = 'const total = ';
const AT_END: CompletionPosition = { lineNumber: 1, column: LINE.length + 1 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waiting for a pause in typing', () => {
  test('asks for nothing until the debounce has run', async () => {
    const { provider, send } = harness();
    const pending = provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, fakeToken());

    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS - 1);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ items: [{ insertText: 'a + b;' }] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('a burst of keystrokes costs one request, not one each', async () => {
    const { provider, send } = harness();
    const model = fakeModel(LINE);

    const first = provider.provideInlineCompletions(model, AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(100);
    const second = provider.provideInlineCompletions(model, AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(100);
    const third = provider.provideInlineCompletions(model, AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    await expect(third).resolves.toEqual({ items: [{ insertText: 'a + b;' }] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('sends the whole prompt, small, with both halves of the file', async () => {
    const { provider, send } = harness();
    const model = fakeModel(`${LINE}\nconst next = 2;`);
    const pending = provider.provideInlineCompletions(model, AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);
    await pending;

    const { messages, maxTokens } = send.mock.calls[0][0];
    expect(messages[0].role).toBe('system');
    expect(messages[1].content).toContain('<before_cursor>\nconst total = \n</before_cursor>');
    expect(messages[1].content).toContain('const next = 2;');
    expect(maxTokens).toBeLessThanOrEqual(128);
  });
});

describe('cancellation', () => {
  test('Monaco cancelling during the wait means no request at all', async () => {
    const { provider, send } = harness();
    const token = fakeToken();
    const pending = provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, token);

    token.cancel();
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);

    await expect(pending).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  test('a token already cancelled is refused before anything is read', async () => {
    const { provider, send } = harness();
    const token = fakeToken();
    token.cancel();

    await expect(provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, token))
      .resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  test('the next keystroke aborts the request already in flight', async () => {
    const { provider, signals } = harness(neverAnswers);
    const model = fakeModel(LINE);

    const first = provider.provideInlineCompletions(model, AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);
    expect(signals[0].aborted).toBe(false);

    void provider.provideInlineCompletions(model, AT_END, null, fakeToken());
    expect(signals[0].aborted).toBe(true);
    await expect(first).resolves.toBeUndefined();
  });

  test('cancel() drops a pending wait as well', async () => {
    const { provider, send } = harness();
    const pending = provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, fakeToken());

    provider.cancel();
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);

    await expect(pending).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('when not to suggest anything', () => {
  async function refusedBy(mutate: (state: ReturnType<typeof harness>) => void, position = AT_END, text = LINE) {
    const state = harness();
    mutate(state);

    const pending = state.provider.provideInlineCompletions(fakeModel(text), position, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS * 2);

    await expect(pending).resolves.toBeUndefined();
    expect(state.send).not.toHaveBeenCalled();
  }

  test('completion is off', async () => {
    await refusedBy((state) => { state.settings = { mode: 'off', singleLine: true }; });
  });

  test('completion is on demand only — typing must not spend the daily tier', async () => {
    await refusedBy((state) => { state.settings = { mode: 'onDemand', singleLine: true }; });
  });

  test('the fast backend has no provider key', async () => {
    await refusedBy((state) => { state.backend = 'unconfigured'; });
  });

  test('the fast backend refused the session', async () => {
    await refusedBy((state) => { state.backend = 'unauthenticated'; });
  });

  test('the fast backend is unreachable', async () => {
    await refusedBy((state) => { state.backend = 'offline'; });
  });

  test('there is a selection to act on instead', async () => {
    await refusedBy((state) => { state.selection = true; });
  });

  test('the cursor stands in the middle of a word', async () => {
    await refusedBy(() => undefined, { lineNumber: 1, column: 17 }, 'const total = value');
  });

  test('the rest of the line is still code', async () => {
    await refusedBy(() => undefined, { lineNumber: 1, column: 15 }, 'const total = 1 + 2;');
  });

  test('but closing punctuation after the cursor is not code in the way', async () => {
    const { provider, send } = harness();
    const pending = provider.provideInlineCompletions(
      fakeModel('call(  );'),
      { lineNumber: 1, column: 7 },
      null,
      fakeToken(),
    );
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);

    await expect(pending).resolves.toEqual({ items: [{ insertText: 'a + b;' }] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('an answer that is only whitespace is no suggestion', async () => {
    const { provider, status } = harness('   \n  ');
    const pending = provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);

    await expect(pending).resolves.toBeUndefined();
    expect(status.get().suggested).toBe(0);
    expect(status.get().errors).toBe(0);
  });
});

describe('serving from memory', () => {
  test('an answered site is never asked about twice', async () => {
    const { provider, send, cache } = harness();
    cache.set('const total = ', '', 'seen before');

    // No timers advanced: a cache hit must not wait for the debounce.
    await expect(provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, fakeToken()))
      .resolves.toEqual({ items: [{ insertText: 'seen before' }] });
    expect(send).not.toHaveBeenCalled();
  });

  test('typing out the suggestion keeps it on screen without another request', async () => {
    const { provider, send } = harness('.map((item) => item.id)');
    const first = provider.provideInlineCompletions(fakeModel('items'), { lineNumber: 1, column: 6 }, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);
    await first;

    // The user types the first two characters of what was suggested.
    await expect(provider.provideInlineCompletions(
      fakeModel('items.m'),
      { lineNumber: 1, column: 8 },
      null,
      fakeToken(),
    )).resolves.toEqual({ items: [{ insertText: 'ap((item) => item.id)' }] });

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('counters for the status item', () => {
  test('a suggestion is counted when it is offered', async () => {
    const { provider, status } = harness();
    const pending = provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);
    await pending;

    expect(status.get().suggested).toBe(1);
    expect(status.get().working).toBe(false);
  });

  test('an acceptance is counted when Monaco reports one', () => {
    const { provider, status } = harness();
    const list = { items: [{ insertText: 'a' }] };

    provider.handleEndOfLifetime(list, list.items[0], { kind: 0 });
    expect(status.get().accepted).toBe(1);

    // Rejected and ignored are not acceptances.
    provider.handleEndOfLifetime(list, list.items[0], { kind: 1 });
    provider.handleEndOfLifetime(list, list.items[0], { kind: 2 });
    expect(status.get().accepted).toBe(1);
  });

  test('a failure is counted and never thrown into Monaco', async () => {
    const { provider, status } = harness(() => Promise.reject(new Error('The completion service answered 401.')));
    const pending = provider.provideInlineCompletions(fakeModel(LINE), AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);

    await expect(pending).resolves.toBeUndefined();
    expect(status.get().errors).toBe(1);
    expect(status.get().lastError).toBe('The completion service answered 401.');
    expect(status.get().working).toBe(false);
  });

  test('an aborted request is not a failure', async () => {
    const { provider, status } = harness(neverAnswers);
    const model = fakeModel(LINE);

    void provider.provideInlineCompletions(model, AT_END, null, fakeToken());
    await vi.advanceTimersByTimeAsync(IDLE_DEBOUNCE_MS);
    provider.cancel();
    await vi.advanceTimersByTimeAsync(0);

    expect(status.get().errors).toBe(0);
  });
});

describe('the two positional rules on their own', () => {
  test('isMidWord', () => {
    expect(isMidWord('const value', 8)).toBe(true);
    expect(isMidWord('const value', 12)).toBe(false);
    expect(isMidWord('const ', 7)).toBe(false);
    expect(isMidWord('', 1)).toBe(false);
  });

  test('lineTailBlocks', () => {
    expect(lineTailBlocks('const a = ', 11)).toBe(false);
    expect(lineTailBlocks('call(  );', 7)).toBe(false);
    expect(lineTailBlocks('const a = 1;', 11)).toBe(true);
  });
});
