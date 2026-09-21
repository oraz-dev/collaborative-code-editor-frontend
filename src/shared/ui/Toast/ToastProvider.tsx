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
import { classNames } from '@/shared/lib/classNames/classNames';
import { Toast } from './Toast';
import { ToastContext, type ToastRequest } from './toastContext';
import cls from './ToastStack.module.scss';

interface ActiveToast extends ToastRequest {
  id: number;
}

const DEFAULT_DURATION = 6000;
const MAX_VISIBLE = 4;
/** Must stay in step with --duration-base, which drives `.leaving` in ToastStack.module.scss. */
const EXIT_DURATION = 200;

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider = memo((props: ToastProviderProps) => {
  const { children } = props;

  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const [leavingIds, setLeavingIds] = useState<number[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const exitTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    // Dismissing twice — close clicked again, or the auto-timer landing on a
    // toast already on its way out — must not restart the exit or queue a
    // second removal for the same id.
    if (exitTimers.current.has(id)) return;

    // The toast stays mounted for one exit animation, then leaves state.
    setLeavingIds((current) => [...current, id]);
    exitTimers.current.set(id, setTimeout(() => {
      exitTimers.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
      setLeavingIds((current) => current.filter((leavingId) => leavingId !== id));
    }, EXIT_DURATION));
  }, []);

  const showToast = useCallback((request: ToastRequest) => {
    const id = nextId.current++;
    // The oldest falls off rather than the stack growing without bound — but a
    // toast that is mid-exit is still in state for one animation beat, and
    // counting it would evict a live toast to make room for a corpse.
    setToasts((current) => {
      const next = [...current, { ...request, id }];
      const live = next.filter((toast) => !exitTimers.current.has(toast.id));
      const excess = live.length - MAX_VISIBLE;
      if (excess <= 0) return next;

      const evicted = new Set(live.slice(0, excess).map((toast) => toast.id));
      return next.filter((toast) => !evicted.has(toast.id));
    });

    const duration = request.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismissToast(id), duration));
    }
  }, [dismissToast]);

  useEffect(() => {
    const pending = timers.current;
    const exiting = exitTimers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
      // Without this an exit timer outlives the provider and fires setState on
      // an unmounted tree.
      exiting.forEach(clearTimeout);
      exiting.clear();
    };
  }, []);

  const api = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={cls.stack} role="region" aria-label="Notifications" data-testid="toast-stack">
          {toasts.map((toast) => (
            <div
              className={classNames(cls.item, { [cls.leaving]: leavingIds.includes(toast.id) })}
              key={toast.id}
            >
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
