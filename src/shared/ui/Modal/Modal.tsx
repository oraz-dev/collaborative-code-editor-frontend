import { memo, type ReactNode, useEffect, useCallback } from 'react';
import cls from './Modal.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon } from '@/shared/ui/Icon/Icon';

type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: ModalSize;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const Modal = memo((props: ModalProps) => {
  const { open, onClose, title, size = 'md', footer, children, className } = props;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <div
      className={classNames(cls.scrim, { [cls.open]: open })}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={classNames(cls.modal, { [cls[size]]: true }, [className])}>
        {title && (
          <div className={cls.header}>
            <span className={cls.title}>{title}</span>
            <button className={cls.closeBtn} onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        <div className={cls.body}>{children}</div>
        {footer && <div className={cls.footer}>{footer}</div>}
      </div>
    </div>
  );
});
