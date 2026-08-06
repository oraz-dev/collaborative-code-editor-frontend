import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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

  const blocked = whyNotRunnable(entry);

  const document_ = useMemo(() => {
    if (blocked) return '';
    return buildPreviewDocument({ files, entry });
  }, [blocked, files, entry]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // The frame is opaque-origin, so `event.origin` is "null" and proves
      // nothing. Identity comes from the window itself.
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.channel !== CHANNEL) return;
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
  }, [document_]);

  const handleRerun = useCallback(() => {
    // Re-mounting the frame is what actually replays it: an unchanged `srcDoc`
    // is not a change, so React would leave the existing document running.
    setRunCount((count) => count + 1);
    setLines([]);
    onRerun?.();
  }, [onRerun]);

  const onClear = useCallback(() => {
    setLines([]);
  }, []);

  const onToggleConsole = useCallback(() => {
    setShowConsole((visible) => !visible);
  }, []);

  const errorCount = lines.filter((line) => line.level === 'error').length;

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
          {lines.length === 0 && <div className={cls.empty}>No output yet.</div>}
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
