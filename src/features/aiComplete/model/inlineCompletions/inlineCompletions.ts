import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '@/features/aiProjects';
import type { FastBackendState } from '../completionBackend/completionBackend';
import type { CompleteSettings } from '../completeSettings/completeSettings';
import { createCompletionCache, type CompletionCache } from '../completionCache/completionCache';
import {
  cleanCompletion,
  completionContext,
  completionMessages,
} from '../completionPrompt/completionPrompt';

/**
 * The ghost text: what Monaco asks for while someone types, and everything
 * that stops it asking.
 *
 * Almost all of this file is refusal. A completion engine that answers every
 * keystroke is not helpful, it is noise with a bill attached — so the provider
 * waits for a real pause, drops the request the moment the next key goes down,
 * and declines outright in every position where a suggestion would be wrong.
 * What is left is one suggestion, at a stop, with Monaco owning the ghost text
 * and the Tab that accepts it.
 */

/**
 * How long typing must pause before a request goes out. Long enough that a
 * burst of typing costs one request instead of thirty, short enough that a
 * pause to think is answered before the thought finishes.
 */
export const IDLE_DEBOUNCE_MS = 350;

/** A completion is a line or two; a larger budget only buys a slower answer. */
export const MAX_COMPLETION_TOKENS = 96;

/** The languages the provider is registered for. */
export const COMPLETION_LANGUAGES = [
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
  'html',
  'css',
  'json',
];

/** Identifier characters: what it means to be standing in the middle of a word. */
const WORD = /[A-Za-z0-9_$]/;

/**
 * The rest of a line that a suggestion may still be inserted in front of:
 * whitespace and the punctuation that closes what is already open. Anything
 * else is code the user has written, and a suggestion would be written into
 * the middle of it.
 */
const CLOSERS_ONLY = /^[\s)\]}>,;:'"`]*$/;

/** `InlineCompletionEndOfLifeReasonKind.Accepted`, which is an enum value and so a runtime import. */
const ACCEPTED = 0;

export interface CompletionStatus {
  /** What the fast backend is, as last probed. */
  backend: FastBackendState;
  /** A request is in flight right now. */
  working: boolean;
  suggested: number;
  accepted: number;
  errors: number;
  lastError: string | null;
}

const EMPTY_STATUS: CompletionStatus = {
  backend: 'offline',
  working: false,
  suggested: 0,
  accepted: 0,
  errors: 0,
  lastError: null,
};

type Listener = () => void;

export interface CompletionStatusStore {
  get(): CompletionStatus;
  subscribe(listener: Listener): () => void;
  setBackend(backend: FastBackendState): void;
  setWorking(working: boolean): void;
  countSuggested(): void;
  countAccepted(): void;
  recordError(message: string): void;
  reset(): void;
}

/**
 * The counters behind the status bar item.
 *
 * An external store rather than state on a component: the provider is created
 * once and lives inside Monaco, where there is no React to set state from, and
 * the status item is one small subscriber that must not re-render the editor.
 */
export function createCompletionStatusStore(): CompletionStatusStore {
  let current: CompletionStatus = EMPTY_STATUS;
  const listeners = new Set<Listener>();

  const update = (patch: Partial<CompletionStatus>): void => {
    current = { ...current, ...patch };
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setBackend(backend) {
      if (backend !== current.backend) update({ backend });
    },
    setWorking(working) {
      if (working !== current.working) update({ working });
    },
    countSuggested() {
      update({ suggested: current.suggested + 1 });
    },
    countAccepted() {
      update({ accepted: current.accepted + 1 });
    },
    recordError(message) {
      update({ errors: current.errors + 1, lastError: message });
    },
    reset() {
      update(EMPTY_STATUS);
    },
  };
}

/** One per app, like the type registry: Monaco's providers are global too. */
export const completionStatusStore = createCompletionStatusStore();

function getServerSnapshot(): CompletionStatus {
  return EMPTY_STATUS;
}

export function useCompletionStatus(store: CompletionStatusStore = completionStatusStore): CompletionStatus {
  return useSyncExternalStore(store.subscribe, store.get, getServerSnapshot);
}

/**
 * The slice of Monaco this provider actually uses.
 *
 * Structural rather than `editor.ITextModel`, so the tests can hand it four
 * functions instead of building an editor; the registration casts once, where
 * the real Monaco types are in scope.
 */
export interface CompletionPosition {
  lineNumber: number;
  column: number;
}

export interface CompletionModel {
  getValue(): string;
  getOffsetAt(position: CompletionPosition): number;
  getLineContent(lineNumber: number): string;
}

export interface CompletionToken {
  isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export interface CompletionItem {
  insertText: string;
}

export interface CompletionList {
  items: CompletionItem[];
}

export interface InlineCompletionsDeps {
  /** Read per request, so changing a setting takes effect on the next keystroke. */
  readSettings: () => CompleteSettings;
  readBackend: () => FastBackendState;
  /** The open file's path, for the prompt's language and project context. */
  readFilePath: () => string;
  /** True while text is selected: a suggestion would compete with the selection. */
  hasSelection: () => boolean;
  send: (input: { messages: ChatMessage[]; maxTokens: number; signal: AbortSignal }) => Promise<string>;
  cache?: CompletionCache;
  status?: CompletionStatusStore;
  debounceMs?: number;
}

export interface InlineCompletionsProviderHandle {
  provideInlineCompletions(
    model: CompletionModel,
    position: CompletionPosition,
    context: unknown,
    token: CompletionToken,
  ): Promise<CompletionList | undefined>;
  handleEndOfLifetime(completions: CompletionList, item: CompletionItem, reason: { kind: number }): void;
  disposeInlineCompletions(): void;
  /** Drops the pending debounce and aborts the request in flight. */
  cancel(): void;
}

/** Standing inside an identifier: completing here would write into the middle of a name. */
export function isMidWord(lineContent: string, column: number): boolean {
  const before = lineContent[column - 2] ?? '';
  const after = lineContent[column - 1] ?? '';
  return WORD.test(before) && WORD.test(after);
}

/** Whether what follows the cursor on this line is code rather than closers. */
export function lineTailBlocks(lineContent: string, column: number): boolean {
  return !CLOSERS_ONLY.test(lineContent.slice(column - 1));
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'The completion could not be fetched.';
}

/**
 * A provider for Monaco's inline completions, with its own debounce and its
 * own cancellation.
 *
 * Monaco does debounce providers itself, but it cannot know that this one
 * costs a network round trip, and it does not abort the request it no longer
 * wants — so the idle wait and the `AbortController` are ours. Every path out
 * of here resolves: an error thrown into Monaco's completion loop breaks the
 * loop for every other provider too, so a failure is counted and becomes no
 * suggestion.
 */
export function createInlineCompletionsProvider(
  deps: InlineCompletionsDeps,
): InlineCompletionsProviderHandle {
  const {
    readSettings,
    readBackend,
    readFilePath,
    hasSelection,
    send,
    cache = createCompletionCache(),
    status = completionStatusStore,
    debounceMs = IDLE_DEBOUNCE_MS,
  } = deps;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let supersede: (() => void) | null = null;
  let inflight: AbortController | null = null;

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    supersede?.();
    supersede = null;
    // Only ours is cleared: `working` is also set by the explicit Cmd+I
    // completion, and a keystroke during that one must not blank the status.
    if (inflight) {
      inflight.abort();
      inflight = null;
      status.setWorking(false);
    }
  };

  /** Resolves true when typing has really stopped, false when it has not. */
  const waitIdle = (token: CompletionToken): Promise<boolean> => new Promise<boolean>((resolve) => {
    let settled = false;
    let subscription: { dispose(): void } | null = null;

    const finish = (idle: boolean): void => {
      if (settled) return;
      settled = true;
      subscription?.dispose();
      resolve(idle);
    };

    timer = setTimeout(() => finish(true), debounceMs);
    supersede = () => finish(false);
    subscription = token.onCancellationRequested(() => finish(false));
  });

  return {
    async provideInlineCompletions(model, position, _context, token) {
      // Whatever else happens, the previous keystroke's work stops here: its
      // debounce is dropped and its request is aborted.
      cancel();

      const settings = readSettings();
      if (settings.mode !== 'asYouType') return undefined;
      // As-you-type is the fast backend or nothing. The on-demand tier is
      // fifty requests a day and would be spent in a minute of typing.
      if (readBackend() !== 'available') return undefined;
      if (hasSelection()) return undefined;
      if (token.isCancellationRequested) return undefined;

      const lineContent = model.getLineContent(position.lineNumber);
      if (isMidWord(lineContent, position.column)) return undefined;
      if (lineTailBlocks(lineContent, position.column)) return undefined;

      const context = completionContext({
        text: model.getValue(),
        offset: model.getOffsetAt(position),
        filePath: readFilePath(),
      });

      // Before the debounce, not after: the whole point of the cache is that a
      // suggestion the user is typing out stays on screen without a round trip.
      const cached = cache.get(context.textBeforeCursor, context.textAfterCursor);
      if (cached) {
        status.countSuggested();
        return { items: [{ insertText: cached }] };
      }

      const idle = await waitIdle(token);
      if (!idle || token.isCancellationRequested) return undefined;

      const controller = new AbortController();
      inflight = controller;
      status.setWorking(true);

      try {
        const raw = await send({
          messages: completionMessages(context),
          maxTokens: MAX_COMPLETION_TOKENS,
          signal: controller.signal,
        });
        if (controller.signal.aborted || token.isCancellationRequested) return undefined;

        const completion = cleanCompletion(raw, {
          textAfterCursor: context.textAfterCursor,
          singleLine: settings.singleLine,
        });
        // A refusal is not a failure: a model with nothing useful to add says
        // so, and an empty answer is the right outcome rather than an error.
        if (!completion) return undefined;

        cache.set(context.textBeforeCursor, context.textAfterCursor, completion);
        status.countSuggested();
        return { items: [{ insertText: completion }] };
      } catch (error) {
        // An aborted request is this provider's own doing, not a fault.
        if (controller.signal.aborted) return undefined;
        status.recordError(describe(error));
        return undefined;
      } finally {
        if (inflight === controller) {
          inflight = null;
          status.setWorking(false);
        }
      }
    },

    handleEndOfLifetime(_completions, _item, reason) {
      if (reason?.kind === ACCEPTED) status.countAccepted();
    },

    disposeInlineCompletions() {
      // Nothing is held per list; the strings are the items.
    },

    cancel,
  };
}
