import { memo, type ReactNode } from 'react';
import cls from './ListRow.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export const ListRow = memo((props: ListRowProps) => {
  const { leading, title, subtitle, trailing, className } = props;

  return (
    <div className={classNames(cls.listRow, {}, [className])}>
      {leading}
      <div className={cls.text}>
        <div className={cls.title}>{title}</div>
        {subtitle && <div className={cls.subtitle}>{subtitle}</div>}
      </div>
      {trailing}
    </div>
  );
});
