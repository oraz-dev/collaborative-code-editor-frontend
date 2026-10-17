import { useEffect, type RefObject } from 'react';

/**
 * Closes a popover on Escape or a press outside it. The anchor (the button
 * that toggles it) counts as inside, so pressing it toggles instead of closing
 * and immediately reopening.
 */
export function useDismiss(
  open: boolean,
  onDismiss: () => void,
  refs: readonly RefObject<HTMLElement | null>[],
): void {
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onDismiss, refs]);
}
