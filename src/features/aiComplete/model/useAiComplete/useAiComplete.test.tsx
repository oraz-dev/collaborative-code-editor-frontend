import { renderHook, waitFor } from '@testing-library/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { completeSettingsStore } from '../completeSettings/completeSettings';
import { completionStatusStore } from '../inlineCompletions/inlineCompletions';
import { resetFastBackend, useAiComplete } from './useAiComplete';

/**
 * A fake Monaco and a fake editor, and a fake network underneath both: the
 * hook is the only real thing here, and nothing it does leaves the process.
 */

const LINE = 'const total = ';
const CURSOR = { lineNumber: 1, column: LINE.length + 1 };

interface Deferred {
  resolve(body: unknown): void;
  reject(error: unknown): void;
  readonly aborted: boolean;
}

let chatAnswer: { content: string } | Deferred | null = null;
const disposals: string[] = [];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A completion the test resolves by hand, which rejects when aborted. */
function deferred(): Deferred & { response: (signal?: AbortSignal | null) => Promise<Response> } {
  let settle: ((value: Response) => void) | null = null;
  let fail: ((error: unknown) => void) | null = null;
  const state = {
    aborted: false,
    resolve: (body: unknown) => settle?.(jsonResponse(body)),
    reject: (error: unknown) => fail?.(error),
    response: (signal?: AbortSignal | null) => new Promise<Response>((resolveWith, rejectWith) => {
      settle = resolveWith;
      fail = rejectWith;
      signal?.addEventListener('abort', () => {
        state.aborted = true;
        rejectWith(new DOMException('Aborted', 'AbortError'));
      });
    }),
  };
  return state;
}

function isDeferred(value: unknown): value is ReturnType<typeof deferred> {
  return Boolean(value) && typeof (value as { response?: unknown }).response === 'function';
}

function fakeMonaco() {
  const registrations: unknown[] = [];

  return {
    registrations,
    monaco: {
      languages: {
        registerInlineCompletionsProvider: vi.fn((languages: unknown, provider: unknown) => {
          registrations.push({ languages, provider });
          return { dispose: () => disposals.push('provider') };
        }),
      },
      KeyMod: { CtrlCmd: 2048 },
      KeyCode: { KeyI: 39, Escape: 9 },
      Range: class {
        startLineNumber: number;

        startColumn: number;

        endLineNumber: number;

        endColumn: number;

        constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
          this.startLineNumber = startLineNumber;
          this.startColumn = startColumn;
          this.endLineNumber = endLineNumber;
          this.endColumn = endColumn;
        }
      },
    } as unknown as Monaco,
  };
}

function fakeEditor(text = LINE) {
  const keyListeners: Array<(event: { keyCode: number; preventDefault(): void; stopPropagation(): void }) => void> = [];
  const actions: Record<string, { label: string; keybindings: number[]; run: () => void }> = {};

  const model = {
    isDisposed: () => false,
    getValue: () => text,
    getOffsetAt: ({ column }: { column: number }) => column - 1,
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
  };

  const instance = {
    actions,
    getModel: () => model,
    getPosition: () => CURSOR,
    getSelection: () => null,
    onKeyDown: vi.fn((listener: (typeof keyListeners)[number]) => {
      keyListeners.push(listener);
      return { dispose: () => disposals.push('keydown') };
    }),
    addAction: vi.fn((descriptor: { id: string; label: string; keybindings: number[]; run: () => void }) => {
      actions[descriptor.id] = descriptor;
      return { dispose: () => disposals.push('action') };
    }),
    executeEdits: vi.fn(() => true),
    pushUndoStop: vi.fn(),
    setPosition: vi.fn(),
    focus: vi.fn(),
  };

  const pressEscape = () => keyListeners.forEach((listener) => listener({
    keyCode: 9,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }));

  return { instance, pressEscape };
}

function mount(text = LINE) {
  const { monaco, registrations } = fakeMonaco();
  const { instance, pressEscape } = fakeEditor(text);
  const view = renderHook(() => useAiComplete(
    monaco,
    instance as unknown as editor.IStandaloneCodeEditor,
    'src/App.ts',
  ));

  return { monaco, registrations, instance, pressEscape, view };
}

function runCommand(instance: ReturnType<typeof fakeEditor>['instance']): void {
  instance.actions['ai-complete.completeAtCursor'].run();
}

beforeEach(() => {
  disposals.length = 0;
  chatAnswer = null;
  localStorage.clear();
  completeSettingsStore.reload();
  completionStatusStore.reset();
  resetFastBackend();

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    // Today's real answer from the fast route: the proxy is there, the
    // provider key is not.
    if (url.includes('/api/ai/fast/v1/models')) {
      return jsonResponse({ error: { message: 'Invalid API Key', code: 'invalid_api_key' } }, 401);
    }

    if (url.includes('/api/ai/v1/chat/completions')) {
      if (isDeferred(chatAnswer)) return chatAnswer.response(init?.signal);
      return jsonResponse({ choices: [{ message: { content: (chatAnswer as { content: string })?.content ?? '' } }] });
    }

    return jsonResponse({ error: 'unauthorized' }, 401);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registering with Monaco', () => {
  test('offers inline completions for the languages this editor opens', () => {
    const { monaco, registrations } = mount();

    expect(monaco.languages.registerInlineCompletionsProvider).toHaveBeenCalledTimes(1);
    expect((registrations[0] as { languages: string[] }).languages)
      .toEqual(expect.arrayContaining(['typescript', 'javascript', 'html', 'css', 'json']));
  });

  test('gives the provider the members Monaco calls', () => {
    const { registrations } = mount();
    const { provider } = registrations[0] as { provider: Record<string, unknown> };

    expect(typeof provider.provideInlineCompletions).toBe('function');
    expect(typeof provider.disposeInlineCompletions).toBe('function');
    expect(typeof provider.handleEndOfLifetime).toBe('function');
  });

  test('lets go of both registrations when the editor goes away', () => {
    const { view } = mount();
    view.unmount();

    expect(disposals).toContain('provider');
    expect(disposals).toContain('action');
  });

  test('probes the fast backend once and publishes what it found', async () => {
    mount();
    await waitFor(() => expect(completionStatusStore.get().backend).toBe('unconfigured'));
  });
});

describe('the explicit command', () => {
  test('is labelled and bound to Cmd+I / Ctrl+I', () => {
    const { instance, monaco } = mount();
    const action = instance.actions['ai-complete.completeAtCursor'];

    expect(action.label).toBe('Complete with AI');
    expect(action.keybindings).toEqual([monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI]);
  });

  test('inserts the completion through the editor’s own edit path', async () => {
    chatAnswer = { content: 'a + b;' };
    const { instance } = mount();

    runCommand(instance);

    await waitFor(() => expect(instance.executeEdits).toHaveBeenCalled());
    const [source, edits] = instance.executeEdits.mock.calls[0] as unknown as [
      string,
      Array<{ text: string; range: { startLineNumber: number; startColumn: number } }>,
    ];

    // `executeEdits`, not a write into the shared Yjs text: the binding has to
    // see an ordinary model change or the two copies drift apart.
    expect(source).toBe('ai-complete');
    expect(edits[0].text).toBe('a + b;');
    expect(edits[0].range.startLineNumber).toBe(CURSOR.lineNumber);
    expect(edits[0].range.startColumn).toBe(CURSOR.column);
    // The caret ends after what was inserted, and the editor keeps focus.
    expect(instance.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: CURSOR.column + 6 });
    expect(instance.focus).toHaveBeenCalled();
  });

  test('cleans the answer before it reaches the document', async () => {
    chatAnswer = { content: 'Here is the completion:\n```ts\na + b;\n```' };
    const { instance } = mount();

    runCommand(instance);

    await waitFor(() => expect(instance.executeEdits).toHaveBeenCalled());
    const [, edits] = instance.executeEdits.mock.calls[0] as unknown as [string, Array<{ text: string }>];
    expect(edits[0].text).toBe('a + b;');
  });

  test('says it is running, and stops saying so when it is done', async () => {
    const pending = deferred();
    chatAnswer = pending;
    const { instance } = mount();

    runCommand(instance);
    await waitFor(() => expect(completionStatusStore.get().working).toBe(true));

    pending.resolve({ choices: [{ message: { content: 'a + b;' } }] });
    await waitFor(() => expect(completionStatusStore.get().working).toBe(false));
    expect(instance.executeEdits).toHaveBeenCalled();
  });

  test('Escape cancels it, and nothing is inserted or counted as a failure', async () => {
    const pending = deferred();
    chatAnswer = pending;
    const { instance, pressEscape } = mount();

    runCommand(instance);
    await waitFor(() => expect(completionStatusStore.get().working).toBe(true));

    pressEscape();

    await waitFor(() => expect(completionStatusStore.get().working).toBe(false));
    expect(pending.aborted).toBe(true);
    expect(instance.executeEdits).not.toHaveBeenCalled();
    expect(completionStatusStore.get().errors).toBe(0);
  });

  test('an empty answer inserts nothing and says why', async () => {
    chatAnswer = { content: '   ' };
    const { instance } = mount();

    runCommand(instance);

    await waitFor(() => expect(completionStatusStore.get().lastError).toMatch(/nothing to add/));
    expect(instance.executeEdits).not.toHaveBeenCalled();
  });

  test('does nothing at all while completion is switched off', async () => {
    completeSettingsStore.setMode('off');
    chatAnswer = { content: 'a + b;' };
    const { instance } = mount();

    runCommand(instance);
    await Promise.resolve();

    expect(instance.executeEdits).not.toHaveBeenCalled();
    expect(completionStatusStore.get().working).toBe(false);
  });

  test('a refused request is counted and never thrown', async () => {
    const failing = deferred();
    chatAnswer = failing;
    const { instance } = mount();

    runCommand(instance);
    await waitFor(() => expect(completionStatusStore.get().working).toBe(true));
    failing.reject(new TypeError('Failed to fetch'));

    await waitFor(() => expect(completionStatusStore.get().errors).toBe(1));
    expect(instance.executeEdits).not.toHaveBeenCalled();
  });
});
