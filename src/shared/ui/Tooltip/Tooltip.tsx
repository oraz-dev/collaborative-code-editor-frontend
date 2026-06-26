import { memo, type ReactNode } from 'react';
import cls from './Tooltip.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  placement?: TooltipPlacement;
  children: ReactNode;
  className?: string;
}

export const Tooltip = memo((props: TooltipProps) => {
  const { content, placement = 'top', children, className } = props;

  return (
    <span className={classNames(cls.tooltip, {}, [className])}>
      {children}
      <span className={classNames(cls.bubble, { [cls[placement]]: true })}>
        {content}
      </span>
    </span>
  );
});
