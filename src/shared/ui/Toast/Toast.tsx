import { memo, type ReactNode } from 'react';
import cls from './Toast.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastProps {
  variant?: ToastVariant;
  title?: string;
  description?: ReactNode;
  onClose?: () => void;
  isLoading?: boolean;
  className?: string;
}

const iconMap: Record<ToastVariant, IconName> = {
  info: 'eye',
  success: 'check',
  warning: 'bell',
  error: 'close',
};

export const Toast = memo((props: ToastProps) => {
  const { variant = 'info', title, description, onClose, isLoading = false, className } = props;

  return (
    <div className={classNames(cls.toast,  { [cls[variant]]: !!variant  }, [className])}>
      {isLoading ? (
        <div className={cls.spinner} />
      ) : (
        <Icon name={iconMap[variant]} size={16} className={cls.icon} />
      )}
      <div className={cls.content}>
        {title && <span className={cls.title}>{title}</span>}
        {description && <span className={cls.description}>{description}</span>}
      </div>
      {onClose && (
        <button onClick={onClose} className={cls.closeBtn} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      )}
      {isLoading && <div className={cls.progressBar} />}
    </div>
  );
});
