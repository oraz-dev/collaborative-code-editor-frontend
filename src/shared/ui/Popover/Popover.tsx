import { memo, type ReactNode } from 'react';
import cls from './Popover.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

interface PopoverProps {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const Popover = memo((props: PopoverProps) => {
  const { title, description, children, className } = props;

  return (
    <div className={classNames(cls.popover, {}, [className])}>
      {title && <div className={cls.title}>{title}</div>}
      {description && <div className={cls.text}>{description}</div>}
      {children}
    </div>
  );
});
