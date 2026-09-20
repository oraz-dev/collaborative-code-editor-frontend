import { memo, useMemo, type CSSProperties } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Button } from '@/shared/ui/Button/Button';
import type { Language } from '@/entities/Language';
import type { RunState } from '@/features/collaboration';
import {
  formatRunMemory,
  formatRunTime,
  runOutcome,
  runStreams,
  type RunOutcome,
} from '../../model/runOutcome/runOutcome';
import cls from './RunOutputPane.module.scss';

interface RunOutputPaneProps {
  className?: string;
  /** Set by the resizable layout in EditorPage. */
  style?: CSSProperties;
  runState: RunState;
  /** The language the file was sent as, for the header. */
  language: Language | null;
  fileName: string;
  /** Display name of whoever triggered the run, when it was not the viewer. */
  requestedByName?: string | null;
  /** Hidden for anyone who is not the owner — only they may trigger a run. */
  canRerun: boolean;
  onRerun: () => void;
  onClose: () => void;
}

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  'ok': 'Finished',
  'compile-error': 'Did not compile',
  'runtime-error': 'Crashed',
  'timeout': 'Timed out',
  'internal': 'Sandbox error',
};

/** Explicit, rather than `cls[outcome]`: the keys are kebab-case and whether
 *  those survive into the module object depends on the bundler's config. */
const OUTCOME_CLASS: Record<RunOutcome, string> = {
  'ok': cls.ok,
  'compile-error': cls.bad,
  'runtime-error': cls.bad,
  'timeout': cls.slow,
  'internal': cls.broken,
};

/**
 * Output from a run on the server's sandbox.
 *
 * This is the non-browser half of running code: a single file goes to Judge0
 * and comes back as stdout, stderr and a status. Nothing renders, so there is
 * no frame here — only streams.
 *
 * It is deliberately shaped like `PreviewPane`, because to the person using it
 * the two are the same button with different engines behind it.
 */
export const RunOutputPane = memo((props: RunOutputPaneProps) => {
  const {
    className,
    style,
    runState,
    language,
    fileName,
    requestedByName,
    canRerun,
    onRerun,
    onClose,
  } = props;

  const { phase, result, failure } = runState;

  const outcome = useMemo(() => (result ? runOutcome(result) : null), [result]);
  const streams = useMemo(() => (result ? runStreams(result) : []), [result]);

  const elapsed = result ? formatRunTime(result.time) : '';
  const memory = result ? formatRunMemory(result.memory) : '';

  return (
    <div
      className={classNames(cls.pane, {}, [className])}
      style={style}
      data-testid="run-output-pane"
    >
      <div className={cls.bar}>
        <span className={cls.title}>Output</span>
        <span className={cls.entry} title={fileName}>{fileName}</span>
        {language && <span className={cls.lang}>{language.name}</span>}
        <span className={cls.spacer} />
        {canRerun && (
          <IconButton
            size="sm"
            onClick={onRerun}
            disabled={phase === 'running'}
            aria-label={`Run ${fileName} again`}
          >
            <Icons.Play size={13} />
          </IconButton>
        )}
        <IconButton size="sm" onClick={onClose} aria-label="Close output">
          <Icons.X size={14} />
        </IconButton>
      </div>

      {phase === 'running' && (
        <div className={cls.state} data-testid="run-pending" role="status" aria-live="polite">
          <Spinner size="large" />
          <p>Running{language ? ` ${language.name}` : ''}…</p>
          {/* A run is broadcast to the room, so this pane can be showing
              somebody else's execution. */}
          {requestedByName && (
            <span className={cls.hint}>Started by {requestedByName}.</span>
          )}
        </div>
      )}

      {phase === 'failed' && failure && (
        <div className={cls.state} data-testid="run-failure" role="alert">
          <Icons.X size={24} />
          <p>{failure.message}</p>
          {canRerun && failure.code !== 'forbidden' && failure.code !== 'unsupported' && (
            <Button size="small" variant="secondary" onClick={onRerun}>
              Try again
            </Button>
          )}
        </div>
      )}

      {phase === 'done' && result && outcome && (
        <>
          <div className={cls.verdict} data-testid="run-verdict">
            <span
              className={classNames(cls.chip, {}, [OUTCOME_CLASS[outcome]])}
              data-testid="run-outcome"
            >
              {OUTCOME_LABEL[outcome]}
            </span>
            <span className={cls.status}>{result.status}</span>
            <span className={cls.spacer} />
            {elapsed && <span className={cls.metric}>{elapsed}</span>}
            {memory && <span className={cls.metric}>{memory}</span>}
          </div>

          <div className={cls.streams} data-testid="run-streams">
            {streams.map((stream) => (
              <section className={cls.stream} key={stream.label}>
                <h3 className={cls.streamLabel}>{stream.label}</h3>
                <pre
                  className={classNames(cls.text, { [cls.err]: stream.tone === 'err' })}
                >
                  {stream.text}
                </pre>
              </section>
            ))}

            {/* Ran fine and printed nothing — the usual "nothing happened". */}
            {streams.length === 0 && (
              <p className={cls.empty} data-testid="run-silent">
                Ran without printing anything. Add a print or write to stdout to see output here.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
});
