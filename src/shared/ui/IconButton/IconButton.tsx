import { memo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './IconButton.module.scss';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  variant?: 'default' | 'solid';
  active?: boolean;
  children: ReactNode;
}

export const IconButton = memo(({ size = 'md', variant = 'default', active, children, className, ...otherProps }: IconButtonProps) => {
  return (
    <button
      className={classNames(cls.iconButton, { [cls.active]: !!active }, [cls[size], cls[variant], className])}
      {...otherProps}
    >
      {children}
    </button>
  );
});
