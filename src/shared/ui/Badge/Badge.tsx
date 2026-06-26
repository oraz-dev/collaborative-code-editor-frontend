import { memo, type ReactNode } from 'react';
import cls from './Badge.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'error';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: IconName;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export const Badge = memo((props: BadgeProps) => {
  const {
    variant = 'default',
    size = 'sm',
    icon,
    dot = false,
    children,
    className,
  } = props;

  const mods = {
    [cls[variant]]: true,
    [cls[size]]: true,
  };

  return (
    <span className={classNames(cls.badge, mods, [className])}>
      {dot && <span className={cls.dot} />}
      {icon && <Icon name={icon} size={12} className={cls.icon} />}
      {children}
    </span>
  );
});