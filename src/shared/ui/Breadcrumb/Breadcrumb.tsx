import { memo, type ReactNode } from 'react';
import cls from './Breadcrumb.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon } from '@/shared/ui/Icon/Icon';

export interface BreadcrumbItem {
  key: string;
  label: ReactNode;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb = memo((props: BreadcrumbProps) => {
  const { items, className } = props;

  return (
    <nav className={classNames(cls.breadcrumb, {}, [className])}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.key} className={cls.item}>
            {isLast ? (
              <span className={cls.current}>{item.label}</span>
            ) : (
              <>
                <button className={cls.link} onClick={item.onClick} aria-label={typeof item.label === 'string' ? item.label : undefined}>
                  {item.label}
                </button>
                <span className={cls.separator}>
                  <Icon name="chevron" className={cls.separatorIconRotated} />
                </span>
              </>
            )}
          </span>
        );
      })}
    </nav>
  );
});
