import { memo } from 'react';
import cls from './Divider.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

type DividerOrientation = 'horizontal' | 'vertical';

interface DividerProps {
  orientation?: DividerOrientation;
  caret?: boolean;
  className?: string;
}

export const Divider = memo((props: DividerProps) => {
  const { orientation = 'horizontal', caret = false, className } = props;

  return (
    <div
      className={classNames(cls[orientation], { [cls.caret]: caret && orientation === 'horizontal' }, [className])}
      role="separator"
    />
  );
});
