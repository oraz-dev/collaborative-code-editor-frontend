import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Progress } from '@/shared/ui/Progress/Progress';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import type { PackageProgress, TypeProgressSnapshot } from '../../model/typeSupport/typeProgress/typeProgress';
import { retryTypes, useTypeProgress } from '../../model/typeSupport/useTypeSupport/useTypeSupport';
import cls from './TypeLoadingStatus.module.scss';

/** A load that settles faster than this — types already cached — never shows at all. */
export const SHOW_DELAY_MS = 300;
/** How long "Types ready" stays before the item folds away. */
export const DONE_LINGER_MS = 2400;
const PANEL_WIDTH = 320;
const GUTTER = 8;

type Phase = 'hidden' | 'loading' | 'done' | 'attention';

interface TypeLoadingStatusProps {
  className?: string;
  /** Injected in tests; the app reads the live download progress. */
  snapshot?: TypeProgressSnapshot;
  onRetry?: (name: string) => void;
}

function rowDetail(entry: PackageProgress): string {
  switch (entry.status) {
    case 'loading':
      return entry.filesFound === 0 ? 'Resolving…' : `${entry.filesDone} / ${entry.filesFound} files`;
    case 'ready':
      return `${entry.filesFound} ${entry.filesFound === 1 ? 'file' : 'files'}`;
    case 'untyped':
      return 'No types published';
    default:
      return 'Download failed';
  }
}

function RowIcon({ status }: { status: PackageProgress['status'] }) {
  if (status === 'loading') return <Spinner size="small" className={cls.rowSpinner} />;
  if (status === 'ready') return <Icons.CheckCircle size={14} className={cls.ok} aria-hidden />;
  if (status === 'untyped') return <Icons.Minus size={14} className={cls.muted} aria-hidden />;
  return <Icons.Warning size={14} className={cls.warn} aria-hidden />;
}

interface PackageRowProps {
  entry: PackageProgress;
  onRetry: (name: string) => void;
}

const PackageRow = memo(({ entry, onRetry }: PackageRowProps) => {
  const onRetryClick = useCallback(() => onRetry(entry.name), [entry.name, onRetry]);
  const via = entry.source && entry.source !== entry.name ? entry.source : null;

  return (
    <li className={cls.row} data-status={entry.status}>
      <span className={cls.rowIcon}><RowIcon status={entry.status} /></span>
      <span className={cls.rowMain}>
        <span className={cls.rowTop}>
          <span className={cls.name}>{entry.name}</span>
          <span className={cls.detail}>{rowDetail(entry)}</span>
        </span>
        {(entry.version || via) && (
          <span className={cls.meta}>
            {entry.version && `v${entry.version}`}
            {via && `${entry.version ? ' · ' : ''}via ${via}`}
          </span>
        )}
        {entry.status === 'loading' && (
          <Progress value={entry.percent} size="xs" label={`Types for ${entry.name}`} className={cls.rowBar} />
        )}
      </span>
      {entry.status === 'failed' && (
        <button
          type="button"
          className={cls.retry}
          onClick={onRetryClick}
          aria-label={`Retry downloading types for ${entry.name}`}
        >
          <Icons.Retry size={12} aria-hidden />
          Retry
        </button>
      )}
    </li>
  );
});

/**
 * Package types downloading in the background, as a status bar item.
 *
 * Folded away until a download takes long enough to notice, then a compact
 * bar with a count; click for every package, its version, where its types
 * come from and how far along it is. Settles to "Types ready" and folds away
 * again — or stays, with a retry, when a download failed.
 */
export const TypeLoadingStatus = memo((props: TypeLoadingStatusProps) => {
  const { className, snapshot: injected, onRetry = retryTypes } = props;
  const live = useTypeProgress();
  const snapshot = injected ?? live;

  const failed = snapshot.packages.filter((entry) => entry.status === 'failed').length;
  const [open, setOpen] = useState(false);
  // `revealed`: this burst of downloads has lasted long enough to show.
  // `lingering`: it finished while shown, and "Types ready" is on screen.
  const [revealed, setRevealed] = useState(false);
  const [lingering, setLingering] = useState(false);
  const [wasActive, setWasActive] = useState(snapshot.active);

  // Adjusted during render, as React prescribes for state that follows a
  // prop's transitions: the moment downloads stop, not an effect later.
  if (wasActive !== snapshot.active) {
    setWasActive(snapshot.active);
    if (snapshot.active && lingering) {
      // More arrived while "ready" was showing: straight back to the bar.
      setLingering(false);
      setRevealed(true);
    } else if (!snapshot.active && revealed) {
      setRevealed(false);
      setLingering(failed === 0);
    }
  }

  useEffect(() => {
    if (!snapshot.active || revealed) return undefined;
    const timer = setTimeout(() => setRevealed(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [snapshot.active, revealed]);

  useEffect(() => {
    if (!lingering || open) return undefined;
    const timer = setTimeout(() => setLingering(false), DONE_LINGER_MS);
    return () => clearTimeout(timer);
  }, [lingering, open]);

  let phase: Phase = 'hidden';
  if (snapshot.active) phase = revealed ? 'loading' : 'hidden';
  else if (failed > 0) phase = 'attention';
  else if (lingering) phase = 'done';

  const announcement = {
    hidden: '',
    loading: `Loading types for ${snapshot.total} ${snapshot.total === 1 ? 'package' : 'packages'}`,
    done: 'Types ready',
    attention: `Types for ${failed} ${failed === 1 ? 'package' : 'packages'} could not be downloaded`,
  }[phase];

  const visible = phase !== 'hidden' || open;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - GUTTER * 2);
    setPosition({
      left: Math.max(GUTTER, Math.min(rect.left, window.innerWidth - width - GUTTER)),
      bottom: window.innerHeight - rect.top + 6,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, place]);

  const onClose = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose]);

  const onToggle = useCallback(() => setOpen((current) => !current), []);

  const current = snapshot.packages.find((entry) => entry.status === 'loading');
  const summary = (() => {
    if (phase === 'attention') return `Types: ${failed} failed`;
    if (phase === 'done') return 'Types ready';
    return 'Loading types';
  })();
  const triggerLabel = phase === 'loading'
    ? `Package types: ${snapshot.settled} of ${snapshot.total} ready, ${snapshot.percent}%. Show details`
    : `${summary}. Show details`;

  const panelStyle = position
    ? ({ '--panel-left': `${position.left}px`, '--panel-bottom': `${position.bottom}px` } as CSSProperties)
    : undefined;

  return (
    <span
      className={classNames(cls.slot, { [cls.shown]: visible }, [className])}
      // The status bar is a live region; this item's counters tick many
      // times a second and must not be read out. Milestones are, below.
      aria-live="off"
      data-testid="type-loading-status"
    >
      <span className={cls.slotInner} inert={!visible}>
        <button
          ref={triggerRef}
          type="button"
          className={classNames(cls.trigger, {
            [cls.triggerDone]: phase === 'done',
            [cls.triggerWarn]: phase === 'attention',
          })}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={triggerLabel}
          title={current ? `Loading types for ${current.name}` : summary}
        >
          {phase === 'done' && <Icons.Check size={12} aria-hidden />}
          {phase === 'attention' && <Icons.Warning size={12} aria-hidden />}
          {(phase === 'loading' || phase === 'hidden') && <Icons.Box size={12} aria-hidden />}
          <span className={cls.triggerText}>{summary}</span>
          {phase === 'loading' && (
            <>
              <Progress value={snapshot.percent} size="xs" className={cls.miniBar} />
              <span className={cls.count}>{snapshot.settled}/{snapshot.total}</span>
            </>
          )}
        </button>
      </span>

      <span className={cls.srOnly} role="status" aria-live="polite">{announcement}</span>

      {open && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          className={classNames(cls.panel, { [cls.placed]: Boolean(position) })}
          // Measured from the trigger, which lives in a strip that scrolls
          // sideways on a phone — so the panel is placed, not nested.
          style={panelStyle}
          role="dialog"
          aria-label="Package types"
          tabIndex={-1}
          data-testid="type-loading-panel"
        >
          <div className={cls.header}>
            <span className={cls.title}>Package types</span>
            <span className={cls.headerCount}>
              {snapshot.active ? `${snapshot.settled} of ${snapshot.total} ready` : 'All settled'}
            </span>
          </div>
          {snapshot.active && (
            <Progress value={snapshot.percent} size="sm" label="All package types" className={cls.overall} />
          )}

          {snapshot.packages.length === 0 ? (
            <p className={cls.empty}>This file imports no packages.</p>
          ) : (
            <ul className={cls.list}>
              {snapshot.packages.map((entry) => (
                <PackageRow key={entry.name} entry={entry} onRetry={onRetry} />
              ))}
            </ul>
          )}

          <p className={cls.footer}>Downloaded once per version, then kept in this browser.</p>
        </div>,
        document.body,
      )}
    </span>
  );
});
