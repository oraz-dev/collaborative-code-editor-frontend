import { memo } from 'react';
import cls from './Progress.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

export type ProgressSize = 'xs' | 'sm' | 'md';
export type ProgressTone = 'primary' | 'success' | 'warning';

interface ProgressProps {
  value?: number;
  indeterminate?: boolean;
  /** What is progressing — a progress bar without a name is announced as just a number. */
  label?: string;
  /** `xs` sits inline in a status bar, `sm` under a list row, `md` stands alone. */
  size?: ProgressSize;
  tone?: ProgressTone;
  className?: string;
}

export const Progress = memo((props: ProgressProps) => {
  const {
    value, indeterminate = false, label, size = 'md', tone = 'primary', className,
  } = props;
  const clamped = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div
      className={classNames(cls.progress, { [cls.indeterminate]: indeterminate }, [className, cls[size], cls[tone]])}
      role="progressbar"
      aria-label={label}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cls.bar}
        // The one value SCSS cannot know: how far along it is. A transform, so
        // the fill animates on the compositor instead of re-laying out the row.
        style={indeterminate ? undefined : { transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  );
});
