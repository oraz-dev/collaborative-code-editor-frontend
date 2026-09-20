import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './Spinner.module.scss';

export type LoaderSize = 'small' | 'large';
export type LoaderTone = 'current' | 'brand';

interface SpinnerProps {
  className?: string;
  size?: LoaderSize;
  /**
   * `current` inherits the caller's colour, which is what keeps the mark
   * legible inside a filled button. `brand` paints the logo's own hues and is
   * only safe on a neutral surface — so it is the default for `large`, which
   * is always a standalone loader, and never for `small`, which is not.
   */
  tone?: LoaderTone;
  /**
   * Supplied, the loader announces itself politely. Omitted, it is decorative
   * and hidden — which is the correct reading wherever the parent already
   * carries `aria-busy`, as the document card and tree rows do. Announcing it
   * there too would say the same thing twice.
   */
  label?: string;
}

export const Spinner = memo((props: SpinnerProps) => {
  const { className, size = 'small', tone = size === 'large' ? 'brand' : 'current', label } = props;

  const announcement = label
    ? { role: 'status' as const, 'aria-label': label }
    : { 'aria-hidden': true };

  return (
    <span
      className={classNames(cls.loader, {}, [className, cls[size], cls[tone]])}
      {...announcement}
    >
      <span className={cls.bar} />
      <span className={cls.bar} />
      <span className={cls.bar} />
    </span>
  );
});
