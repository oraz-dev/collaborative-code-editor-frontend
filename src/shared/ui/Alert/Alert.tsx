import { memo, type ReactNode } from 'react';
import cls from './Alert.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  description?: ReactNode;
  onClose?: () => void;
  className?: string;
}

const iconMap: Record<AlertVariant, IconName> = {
  info: 'eye',
  success: 'check',
  warning: 'bell',
  error: 'close',
};

export const Alert = memo((props: AlertProps) => {
  const { variant = 'info', title, description, onClose, className } = props;

  return (
    <div className={classNames(cls.alert, { [cls[variant]]: !!variant  }, [className])}>
      <Icon name={iconMap[variant]} size={16} className={cls.icon} />
      <div className={cls.content}>
        {title && <span className={cls.title}>{title}</span>}
        {description && <span className={cls.description}>{description}</span>}
      </div>
      {onClose && (
        <button onClick={onClose} className={cls.closeBtn} aria-label="Dismiss">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
});
