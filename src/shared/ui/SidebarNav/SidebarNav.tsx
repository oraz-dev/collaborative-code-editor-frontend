import { memo, type ReactNode } from 'react';
import cls from './SidebarNav.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

export interface NavItem {
  key: string;
  label: ReactNode;
  icon: IconName;
  count?: number;
  onClick?: () => void;
}

interface SidebarNavProps {
  items: NavItem[];
  activeKey?: string;
  collapsed?: boolean;
  className?: string;
}

export const SidebarNav = memo((props: SidebarNavProps) => {
  const { items, activeKey, collapsed = false, className } = props;

  return (
    <nav className={classNames(cls.sidebar, { [cls.mini]: collapsed }, [className])}>
      {items.map((item) => (
        <button
          key={item.key}
          className={classNames(cls.item, { [cls.itemActive]: activeKey === item.key })}
          onClick={item.onClick}
          aria-current={activeKey === item.key ? 'page' : undefined}
        >
          <Icon name={item.icon} className={cls.itemIcon} />
          <span className={cls.label}>{item.label}</span>
          {item.count !== undefined && <span className={cls.count}>{item.count}</span>}
        </button>
      ))}
    </nav>
  );
});
