import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { ResizeHandle } from '@/shared/ui/ResizeHandle/ResizeHandle';
import {
  CONSOLE_HEIGHT_RANGE,
  DEFAULT_PREFERENCES,
  preferencesStore,
  useLayoutPreferences,
} from '@/features/preferences';
import { Icons } from '@/shared/ui/Icon/Icons';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import {
  buildPreviewDocument,
  whyNotRunnable,
  type PreviewFile,
} from '../../model/buildPreviewDocument/buildPreviewDocument';
import { transpileWorkspace } from '../../model/transpile/transpile';
import cls from './PreviewPane.module.scss';

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface ConsoleLine {
  id: number;
  level: ConsoleLevel;
  text: string;
}

interface PreviewPaneProps {
  className?: string;
  /** Set by the resizable layout in EditorPage. */
  style?: CSSProperties;
  files: PreviewFile[];
  entry: string;
  /** Lets the owner re-snapshot the buffer so a replay picks up new edits. */
  onRerun?: () => void;
  onClose?: () => void;
}

const CHANNEL = '__space_preview__';
const MAX_LINES = 500;

/**
 * Runs the workspace in a sandboxed frame.
 *
 * `sandbox="allow-scripts"` **without** `allow-same-origin` is the entire
 * security model: it gives the frame an opaque origin, so previewed code
 * cannot read this app's cookies, `localStorage`, or DOM, and cannot call back
 * into it. Adding `allow-same-origin` alongside `allow-scripts` would let the
 * frame reach up and strip its own sandbox attribute — the two together are
 * equivalent to no sandbox at all.
 */
export const PreviewPane = memo((props: PreviewPaneProps) => {
  const { className, style, files, entry, onRerun, onClose } = props;

  const { consoleHeight } = useLayoutPreferences();

  const onResizeConsole = useCallback((next: number) => {
    preferencesStore.setLayout({ consoleHeight: next });
  }, []);

  const onResetConsole = useCallback(() => {
    preferencesStore.setLayout({ consoleHeight: DEFAULT_PREFERENCES.layout.consoleHeight });
  }, []);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const nextLineId = useRef(0);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [showConsole, setShowConsole] = useState(true);
  /** Set when a run stops early, so a blank frame is never left unexplained. */
  const [runError, setRunError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'pending' | 'drew' | 'silent'>('pending');

  const blocked = whyNotRunnable(entry);

  const [document_, setDocument] = useState('');
  const [buildErrors, setBuildErrors] = useState<string[]>([]);

  // Stripping types is async — sucrase is only fetched the first time a
  // workspace actually contains TypeScript.
  useEffect(() => {
    if (blocked) {
      setDocument('');
      setBuildErrors([]);
      return;
    }

    let cancelled = false;

    transpileWorkspace(files)
      .then(({ files: compiled, failures }) => {
        if (cancelled) return;
        const messages = failures.map((failure) => `${failure.path}: ${failure.message}`);
        setBuildErrors(messages);
        if (messages.length > 0) {
          setRunError(`${messages.length} file${messages.length === 1 ? '' : 's'} failed to compile.`);
          setShowConsole(true);
        }
        setDocument(buildPreviewDocument({ files: compiled, entry }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBuildErrors([error instanceof Error ? error.message : String(error)]);
        setDocument('');
      });

    return () => {
      cancelled = true;
    };
  }, [blocked, files, entry, runCount]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // The frame is opaque-origin, so `event.origin` is "null" and proves
      // nothing. Identity comes from the window itself.
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.channel !== CHANNEL) return;
      if (event.data.type === 'failed') {
        setRunError(String(event.data.text ?? 'The preview stopped with an error.'));
        // The detail is in the console, so make sure it is not collapsed.
        setShowConsole(true);
        return;
      }

      if (event.data.type === 'ready') {
        setOutcome(event.data.drew ? 'drew' : 'silent');
        return;
      }

      if (event.data.type !== 'console') return;

      setLines((current) => [
        ...current,
        {
          id: nextLineId.current++,
          level: (event.data.level ?? 'log') as ConsoleLevel,
          text: String(event.data.text ?? ''),
        },
      ].slice(-MAX_LINES));
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Editing the code starts a fresh run, so previous output is stale.
  useEffect(() => {
    setLines([]);
    setRunError(null);
    setOutcome('pending');
  }, [document_]);

  const handleRerun = useCallback(() => {
    // Re-mounting the frame is what actually replays it: an unchanged `srcDoc`
    // is not a change, so React would leave the existing document running.
    setRunCount((count) => count + 1);
    setLines([]);
    setRunError(null);
    setOutcome('pending');
    onRerun?.();
  }, [onRerun]);

  const onClear = useCallback(() => {
    setLines([]);
  }, []);

  const onToggleConsole = useCallback(() => {
    setShowConsole((visible) => !visible);
  }, []);

  const errorCount = lines.filter((line) => line.level === 'error').length + buildErrors.length;

  return (
    <div className={classNames(cls.pane, {}, [className])} style={style} data-testid="preview-pane">
      <div className={cls.bar}>
        <span className={cls.title}>Preview</span>
        <span className={cls.entry} title={entry}>{entry}</span>
        <span className={cls.spacer} />
        <IconButton size="sm" onClick={handleRerun} aria-label="Re-run preview">
          <Icons.Play size={13} />
        </IconButton>
        <IconButton size="sm" onClick={onClose} aria-label="Close preview">
          <Icons.X size={14} />
        </IconButton>
      </div>

      {blocked ? (
        <div className={cls.blocked} data-testid="preview-blocked">
          <Icons.Files size={24} />
          <p>{blocked}</p>
        </div>
      ) : (
        <div className={cls.stage}>
          <iframe
            key={runCount}
            ref={frameRef}
            className={cls.frame}
            title="Preview"
            // See the component comment: allow-scripts alone is the boundary.
            sandbox="allow-scripts"
            srcDoc={document_}
            data-testid="preview-frame"
          />

          {/* A failed run leaves the frame blank; without this it just looks
              like the button did nothing. */}
          {runError && (
            <div className={cls.failure} role="alert" data-testid="preview-failure">
              <Icons.X size={14} />
              <span className={cls.failureText}>{runError}</span>
            </div>
          )}

          {/* Ran fine but rendered nothing — the usual cause of "nothing
              happened" for a script that only logs. */}
          {!runError && outcome === 'silent' && (
            <div className={cls.silent} data-testid="preview-silent">
              <p>Ran without rendering anything.</p>
              <span>
                {lines.length > 0
                  ? `Output is in the Console below (${lines.length} line${lines.length === 1 ? '' : 's'}).`
                  : 'This code produced no output. Add console.log(…) or write to document.body.'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className={cls.consoleBar}>
        <button
          type="button"
          className={cls.consoleToggle}
          onClick={onToggleConsole}
          aria-expanded={showConsole}
        >
          <span className={cls.chevron} aria-hidden="true">
            {showConsole ? <Icons.ChevD size={12} /> : <Icons.ChevR size={12} />}
          </span>
          Console
          {lines.length > 0 && <span className={cls.count}>{lines.length}</span>}
          {errorCount > 0 && (
            <span className={cls.errorCount} data-testid="preview-error-count">
              {errorCount} error{errorCount === 1 ? '' : 's'}
            </span>
          )}
        </button>
        <button type="button" className={cls.clear} onClick={onClear} aria-label="Clear console">
          Clear
        </button>
      </div>

      {showConsole && (
        <ResizeHandle
          axis="y"
          size={consoleHeight}
          min={CONSOLE_HEIGHT_RANGE.min}
          max={CONSOLE_HEIGHT_RANGE.max}
          // The console sits below the handle, so dragging down shrinks it.
          reversed
          label="Resize console"
          onResize={onResizeConsole}
          onReset={onResetConsole}
        />
      )}

      {showConsole && (
        <div
          className={cls.console}
          style={{ height: consoleHeight }}
          data-testid="preview-console"
        >
          {/* Compile failures first: nothing ran, so they explain the empty frame. */}
          {buildErrors.map((message) => (
            <div className={classNames(cls.line, { [cls.error]: true })} key={message}>
              {message}
            </div>
          ))}
          {lines.length === 0 && buildErrors.length === 0 && (
            <div className={cls.empty}>No output yet.</div>
          )}
          {lines.map((line) => (
            <div className={classNames(cls.line, { [cls[line.level]]: true })} key={line.id}>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
