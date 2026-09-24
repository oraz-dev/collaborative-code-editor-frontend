import { useEffect, useRef } from 'react';
import type { Monaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import { logger } from '@/shared/lib/logger/logger';
import { aiSettingsStore, createProxyFetch, DEFAULT_MODEL } from '@/features/aiProjects';
import {
  FAST_MODEL_FALLBACK,
  pickFastModel,
  probeFastBackend,
  requestCompletion,
  type FastProbe,
} from '../completionBackend/completionBackend';
import { completeSettingsStore } from '../completeSettings/completeSettings';
import {
  cleanCompletion,
  completionContext,
  completionMessages,
} from '../completionPrompt/completionPrompt';
import {
  COMPLETION_LANGUAGES,
  completionStatusStore,
  createInlineCompletionsProvider,
} from '../inlineCompletions/inlineCompletions';

/**
 * Completion wired into the editor: the ghost-text provider, the Cmd+I
 * command, and the one probe that decides whether the first of them may run.
 *
 * Modelled on `useTypeSupport`, which has the same shape of problem — a global
 * Monaco registry, per-app state that must not be rebuilt when a file changes,
 * and a React hook whose only job is to attach and detach it.
 */

/** A completion the user asked for can afford a larger budget than one they did not. */
const ON_DEMAND_MAX_TOKENS = 256;

/** Built once: it holds no user state and reads the session at send time. */
let proxyFetch: typeof fetch | null = null;

function fetchThroughProxy(): typeof fetch {
  proxyFetch ??= createProxyFetch();
  return proxyFetch;
}

/** The probe is one request for the whole app, not one per editor mount. */
let probe: Promise<FastProbe> | null = null;
let fastModel = FAST_MODEL_FALLBACK;

/** Asks the fast route what it is again, and republishes the answer. */
export function refreshFastBackend(fetchImpl: typeof fetch = fetchThroughProxy()): Promise<FastProbe> {
  probe = probeFastBackend(fetchImpl).then((result) => {
    completionStatusStore.setBackend(result.state);
    // A route that answers but lists nothing still gets a model: the fallback
    // is a real id, and asking is better than refusing on a missing catalogue.
    if (result.state === 'available') fastModel = pickFastModel(result.models);
    return result;
  });
  return probe;
}

export function ensureFastBackend(): Promise<FastProbe> {
  probe ??= refreshFastBackend();
  return probe;
}

/** Test seam: forgets the probe so the next mount asks again. */
export function resetFastBackend(): void {
  probe = null;
  fastModel = FAST_MODEL_FALLBACK;
}

/**
 * Registers the inline provider for every language it is meant to serve, and
 * the explicit command on the editor.
 *
 * The provider is registered against Monaco, which is global, so it is created
 * once and reads the open file and the editor through refs — switching files
 * must not tear down and rebuild a provider Monaco is in the middle of asking.
 */
export function useAiComplete(
  monaco: Monaco | null,
  instance: editor.IStandaloneCodeEditor | null,
  filePath: string,
): void {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const filePathRef = useRef(filePath);

  useEffect(() => {
    editorRef.current = instance;
  }, [instance]);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    void ensureFastBackend();
  }, []);

  useEffect(() => {
    // Inline completions are a recent part of the Monaco API and are missing
    // from older builds, exactly as the TypeScript defaults are in
    // `useTypeSupport`. A missing registry costs the ghost text; Cmd+I below
    // is registered on the editor and still works.
    if (typeof monaco?.languages?.registerInlineCompletionsProvider !== 'function') return;

    const provider = createInlineCompletionsProvider({
      readSettings: () => completeSettingsStore.get(),
      readBackend: () => completionStatusStore.get().backend,
      readFilePath: () => filePathRef.current,
      hasSelection: () => {
        const selection = editorRef.current?.getSelection();
        return Boolean(selection) && !selection?.isEmpty();
      },
      send: ({ messages, maxTokens, signal }) => requestCompletion({
        backend: 'fast',
        messages,
        maxTokens,
        signal,
        model: fastModel,
        fetchImpl: fetchThroughProxy(),
      }),
    });

    const registration = monaco.languages.registerInlineCompletionsProvider(
      COMPLETION_LANGUAGES,
      // The provider is typed against the four Monaco members it uses, so the
      // real interface is met here rather than reimplemented in the tests.
      provider as unknown as languages.InlineCompletionsProvider,
    );

    return () => {
      provider.cancel();
      registration.dispose();
    };
  }, [monaco]);

  useEffect(() => {
    // The key constants and `Range` are what the action is built from; a
    // Monaco namespace without them cannot carry a keybinding at all.
    if (!instance || !monaco?.KeyMod || !monaco.KeyCode || !monaco.Range) return;

    let running: AbortController | null = null;

    /**
     * The explicit completion.
     *
     * Inserted with `executeEdits`, the same path a keystroke takes, so the
     * Yjs binding sees an ordinary model change and the edit reaches everyone
     * else in the document. Writing into the shared text directly would put
     * the two copies of the buffer out of step.
     */
    const complete = async (): Promise<void> => {
      const settings = completeSettingsStore.get();
      if (settings.mode === 'off') return;

      const model = instance.getModel();
      const position = instance.getPosition();
      if (!model || model.isDisposed() || !position) return;

      running?.abort();
      const controller = new AbortController();
      running = controller;
      completionStatusStore.setWorking(true);

      // Escape while it runs, which is what Escape means everywhere else in
      // the editor. The keystroke is swallowed so it does not also close
      // something behind the editor.
      const escape = instance.onKeyDown((event) => {
        if (event.keyCode !== monaco.KeyCode.Escape) return;
        event.preventDefault();
        event.stopPropagation();
        controller.abort();
      });

      try {
        const context = completionContext({
          text: model.getValue(),
          offset: model.getOffsetAt(position),
          filePath: filePathRef.current,
        });

        const raw = await requestCompletion({
          backend: 'onDemand',
          messages: completionMessages(context),
          maxTokens: ON_DEMAND_MAX_TOKENS,
          signal: controller.signal,
          // The assistant's own chain: whatever the user picked in Settings,
          // or the model that heads it.
          model: aiSettingsStore.get().modelId || DEFAULT_MODEL,
          fetchImpl: fetchThroughProxy(),
        });
        if (controller.signal.aborted) return;

        const completion = cleanCompletion(raw, {
          textAfterCursor: context.textAfterCursor,
          singleLine: settings.singleLine,
        });
        if (!completion) {
          // Counted as a failed completion because that is what it is to
          // someone who pressed a key and got nothing; the message says why.
          completionStatusStore.recordError('The model had nothing to add at the cursor.');
          return;
        }

        const current = instance.getPosition();
        // The caret may have moved while it was thinking; the insert belongs
        // where the caret is now, which is also where the user is looking.
        const at = current ?? position;
        const offset = model.getOffsetAt(at);

        instance.pushUndoStop();
        instance.executeEdits('ai-complete', [{
          range: new monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column),
          text: completion,
          forceMoveMarkers: true,
        }]);
        instance.pushUndoStop();
        instance.setPosition(model.getPositionAt(offset + completion.length));
        instance.focus();

        completionStatusStore.countSuggested();
        completionStatusStore.countAccepted();
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'The completion failed.';
        completionStatusStore.recordError(message);
        logger.warn('AI completion failed', error);
      } finally {
        escape.dispose();
        if (running === controller) {
          running = null;
          completionStatusStore.setWorking(false);
        }
      }
    };

    const action = instance.addAction({
      id: 'ai-complete.completeAtCursor',
      label: 'Complete with AI',
      // CtrlCmd is Cmd on a Mac and Ctrl everywhere else, which is the
      // binding the label promises on both.
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: () => {
        void complete();
      },
    });

    return () => {
      running?.abort();
      action.dispose();
    };
  }, [monaco, instance]);
}
