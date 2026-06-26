import { memo, type ReactNode } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';
import cls from './Avatar.module.scss';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  className?: string;
  size?: AvatarSize;
  initials?: string;
  icon?: IconName;
  src?: string;
  alt?: string;
  color?: string;
}

export const Avatar = memo((props: AvatarProps) => {
  const { size = 'md', initials, icon, src, alt, color, className } = props;

  const cssVars = color
    ? { '--avatar-bg': color } as React.CSSProperties
    : undefined;

  return (
    <span
      className={classNames(cls.avatar, { [cls[size]]: true, [cls.hasColor]: !!color }, [className])}
      style={cssVars}
    >
      {src ? (
        <img className={cls.image} src={src} alt={alt ?? ''} />
      ) : icon ? (
        <Icon name={icon} className={cls.icon} />
      ) : (
        initials
      )}
    </span>
  );
});

interface AvatarGroupProps {
  children: ReactNode;
  moreCount?: number;
  className?: string;
}

export const AvatarGroup = memo((props: AvatarGroupProps) => {
  const { children, moreCount, className } = props;

  return (
    <div className={classNames(cls.group, {}, [className])}>
      {children}
      {moreCount !== undefined && moreCount > 0 && (
        <span className={cls.more}>+{moreCount}</span>
      )}
    </div>
  );
});
