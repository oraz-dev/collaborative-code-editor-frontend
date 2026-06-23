import { memo } from 'react';
import cls from './Kbd.module.scss';

interface KbdProps {
  className?: string;
  keys?: string[];
  children?: string;
}

export const Kbd = memo((props: KbdProps) => {
  const { keys, children } = props;
  const items = keys || (children ? [children] : []);

  return (
    <span className={cls.kbd}>
      {items.map((k, i) => (
        <kbd key={i} className={cls.key}>{k}</kbd>
      ))}
    </span>
  );
});
