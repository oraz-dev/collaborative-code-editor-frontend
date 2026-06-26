import { memo, type ReactNode, useState, useEffect, useRef } from 'react';
import cls from './DropdownMenu.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  onClick?: () => void;
}

export type MenuEntry = MenuItem | 'divider';

interface DropdownMenuProps {
  trigger: ReactNode;
  items: MenuEntry[];
  className?: string;
}

export const DropdownMenu = memo((props: DropdownMenuProps) => {
  const { trigger, items, className } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open]);

  return (
    <div ref={ref} className={classNames(cls.wrapper, { [cls.open]: open }, [className])}>
      <span role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(!open); }}>{trigger}</span>
      <div className={cls.menu}>
        {items.map((entry, i) => {
          if (entry === 'divider') {
            return <div key={`div-${i}`} className={cls.divider} />;
          }
          return (
            <button
              key={entry.key}
              className={classNames(cls.item, { [cls.danger]: !!entry.danger })}
              onClick={() => {
                entry.onClick?.();
                setOpen(false);
              }}
            >
              {entry.icon && <Icon name={entry.icon} className={cls.itemIcon} />}
              {entry.label}
              {entry.shortcut && <span className={cls.shortcut}>{entry.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
});
