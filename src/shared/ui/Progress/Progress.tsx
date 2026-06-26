import { memo } from 'react';
import cls from './Progress.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

interface ProgressProps {
  value?: number;
  indeterminate?: boolean;
  className?: string;
}

export const Progress = memo((props: ProgressProps) => {
  const { value, indeterminate = false, className } = props;

  return (
    <div
      className={classNames(cls.progress, { [cls.indeterminate]: indeterminate }, [className])}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cls.bar}
        style={indeterminate ? undefined : { width: `${value ?? 0}%` }}
      />
    </div>
  );
});
