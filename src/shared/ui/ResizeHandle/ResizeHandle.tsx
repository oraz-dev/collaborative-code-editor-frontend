import { memo, useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './ResizeHandle.module.scss';

export type ResizeAxis = 'x' | 'y';

interface ResizeHandleProps {
  className?: string;
  /** 'x' drags left/right and resizes a width; 'y' drags up/down for a height. */
  axis: ResizeAxis;
  size: number;
  min: number;
  max: number;
  /** Keyboard increment. Hold shift for four times this. */
  step?: number;
  /**
   * True when the panel being resized sits *after* the handle, so dragging
   * towards it makes it smaller rather than larger.
   */
  reversed?: boolean;
  label: string;
  onResize: (next: number) => void;
  /** Double-click / Enter restores whatever the caller considers default. */
  onReset?: () => void;
}

const DEFAULT_STEP = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * A draggable divider between two panes.
 *
 * Pointer events rather than mouse events, so a trackpad, touch screen and pen
 * all work through the same path, and pointer capture keeps the drag alive when
 * the cursor outruns the handle — which it will, since the handle is only a few
 * pixels wide.
 *
 * It is also a real `separator` widget: focusable, arrow-key resizable and
 * reporting its position, so the layout is adjustable without a mouse.
 */
export const ResizeHandle = memo((props: ResizeHandleProps) => {
  const {
    className,
    axis,
    size,
    min,
    max,
    step = DEFAULT_STEP,
    reversed = false,
    label,
    onResize,
    onReset,
  } = props;

  const drag = useRef<{ start: number; from: number } | null>(null);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    // Ignore anything but the primary button; a right-click drag is not a resize.
    if (event.button !== 0) return;

    drag.current = { start: axis === 'x' ? event.clientX : event.clientY, from: size };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Stops the drag from selecting text across the whole app.
    document.body.classList.add(axis === 'x' ? cls.draggingX : cls.draggingY);
  }, [axis, size]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;

    const position = axis === 'x' ? event.clientX : event.clientY;
    const delta = (position - current.start) * (reversed ? -1 : 1);
    onResize(clamp(current.from + delta, min, max));
  }, [axis, max, min, onResize, reversed]);

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove(cls.draggingX, cls.draggingY);
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const amount = event.shiftKey ? step * 4 : step;
    const grow = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const shrink = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';

    if (event.key === grow || event.key === shrink) {
      event.preventDefault();
      const direction = (event.key === grow ? 1 : -1) * (reversed ? -1 : 1);
      onResize(clamp(size + direction * amount, min, max));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      onResize(min);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      onResize(max);
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && onReset) {
      event.preventDefault();
      onReset();
    }
  }, [axis, max, min, onReset, onResize, reversed, size, step]);

  return (
    <div
      className={classNames(cls.handle, { [cls.x]: axis === 'x', [cls.y]: axis === 'y' }, [className])}
      role="separator"
      // A divider you drag left/right is itself vertical.
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      data-testid={`resize-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span className={cls.grip} aria-hidden="true" />
    </div>
  );
});
