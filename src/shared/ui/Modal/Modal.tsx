import { memo, type ReactNode, useEffect, useCallback, useRef } from 'react';
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

/** Everything a Tab would land on, in document order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const Modal = memo((props: ModalProps) => {
  const { open, onClose, title, size = 'md', footer, children, className } = props;

  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Keeps Tab inside the dialog.
   *
   * The modal renders in place rather than in a portal and leaves the page
   * behind the scrim in the tab order, so without this a Tab walks off into
   * controls the scrim is covering — and that happens by itself, not only by
   * tabbing past the last button: a dialog whose contents change unmounts the
   * focused element, focus falls to `body`, and the next Tab starts at the top
   * of the document.
   */
  const trapTab = useCallback((e: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel) return;

    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (!panel.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Tab') trapTab(e);
    },
    [onClose, trapTab],
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
      <div className={classNames(cls.modal, { [cls[size]]: true }, [className])} ref={panelRef}>
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
