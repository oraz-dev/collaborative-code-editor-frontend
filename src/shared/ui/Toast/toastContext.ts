import { createContext, useContext, type ReactNode } from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastRequest {
  title: string;
  description?: ReactNode;
  variant?: ToastVariant;
  /** Milliseconds on screen; pass 0 to require a manual dismiss. */
  duration?: number;
}

export interface ToastApi {
  showToast: (toast: ToastRequest) => void;
  dismissToast: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * A no-op default keeps `useToast` safe to call from a component rendered
 * without the provider — a missing toast host should never be the thing that
 * breaks a page.
 */
const NOOP: ToastApi = { showToast: () => {}, dismissToast: () => {} };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
