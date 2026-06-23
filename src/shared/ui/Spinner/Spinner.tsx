import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './Spinner.module.scss';

export type LoaderSize = 'small' | 'large';

interface SpinnerProps {
  className?: string;
  size?: LoaderSize;
}

export const Spinner = memo((props: SpinnerProps) => {
  const { className, size = 'small' } = props;

  return (
    <span className={classNames(cls.loader, { [cls[size]]: true }, [className])} />
  );
});
