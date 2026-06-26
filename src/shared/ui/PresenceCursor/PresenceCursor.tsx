import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './PresenceCursor.module.scss';

interface PresenceCursorProps {
  className?: string;
  name: string;
  color: string;
  x: number;
  y: number;
  variant?: 'pointer' | 'caret';
}

export const PresenceCursor = memo((props: PresenceCursorProps) => {
  const { className, name, color, x, y, variant = 'pointer' } = props;

  const cssVars = {
    '--cursor-x': `${x}px`,
    '--cursor-y': `${y}px`,
    '--cursor-color': color,
  } as React.CSSProperties;

  if (variant === 'caret') {
    return (
      <div className={classNames(cls.cursor, {}, [className])} style={cssVars}>
        <div className={cls.caretWrap}>
          <div className={cls.caretLine} />
          <span className={cls.label}>{name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={classNames(cls.cursor, {}, [className])} style={cssVars}>
      <div className={cls.pointerWrap}>
        <svg width={12} height={16} viewBox="0 0 12 16" fill="none">
          <path d="M1 1l10 7.5H5.5L3 15z" fill={color} stroke={color} strokeWidth={1} />
        </svg>
        <span className={cls.pointerLabel}>{name}</span>
      </div>
    </div>
  );
});
