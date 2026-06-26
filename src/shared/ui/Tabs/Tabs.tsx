import { memo, type ReactNode } from 'react';
import cls from './Tabs.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

export interface TabItem {
  key: string;
  label: ReactNode;
  icon?: IconName;
}

interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export const Tabs = memo((props: TabsProps) => {
  const { items, activeKey, onChange, className } = props;

  return (
    <div className={classNames(cls.tabs, {}, [className])}>
      {items.map((item) => (
        <button
          key={item.key}
          className={classNames(cls.tab, { [cls.tabActive]: activeKey === item.key })}
          onClick={() => onChange(item.key)}
          aria-selected={activeKey === item.key}
        >
          {item.icon && <Icon name={item.icon} className={cls.tabIcon} />}
          {item.label}
        </button>
      ))}
    </div>
  );
});

interface PillsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export const Pills = memo((props: PillsProps) => {
  const { items, activeKey, onChange, className } = props;

  return (
    <div className={classNames(cls.pills, {}, [className])}>
      {items.map((item) => (
        <button
          key={item.key}
          className={classNames(cls.pill, { [cls.pillActive]: activeKey === item.key })}
          onClick={() => onChange(item.key)}
          aria-selected={activeKey === item.key}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});
