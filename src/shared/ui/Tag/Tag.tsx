import { memo, type ReactNode } from 'react';
import cls from './Tag.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

interface TagProps {
  children: ReactNode;
  icon?: IconName;
  onRemove?: () => void;
  className?: string;
}

export const Tag = memo((props: TagProps) => {
  const { children, icon, onRemove, className } = props;

  return (
    <span className={classNames(cls.tag, {}, [className])}>
      {icon && <Icon name={icon} size={12} className={cls.icon} />}
      {children}
      {onRemove && (
        <button 
          type="button" 
          className={cls.closeBtn} 
          onClick={onRemove}
          aria-label="Remove tag"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
});
