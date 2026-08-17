import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Toast } from './Toast';
import { ToastContext, type ToastRequest } from './toastContext';
import cls from './ToastStack.module.scss';

interface ActiveToast extends ToastRequest {
  id: number;
}

const DEFAULT_DURATION = 6000;
const MAX_VISIBLE = 4;

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider = memo((props: ToastProviderProps) => {
  const { children } = props;

  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((request: ToastRequest) => {
    const id = nextId.current++;
    // The oldest falls off rather than the stack growing without bound.
    setToasts((current) => [...current, { ...request, id }].slice(-MAX_VISIBLE));

    const duration = request.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismissToast(id), duration));
    }
  }, [dismissToast]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={cls.stack} role="region" aria-label="Notifications" data-testid="toast-stack">
          {toasts.map((toast) => (
            <div className={cls.item} key={toast.id}>
              <Toast
                variant={toast.variant}
                title={toast.title}
                description={toast.description}
                onClose={() => dismissToast(toast.id)}
              />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
});
