import { memo, type ReactNode } from 'react';
import cls from './EmptyState.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export const EmptyState = memo((props: EmptyStateProps) => {
  const { title, description, action, className } = props;

  return (
    <div className={classNames(cls.empty, {}, [className])}>
      <div className={cls.mark}>
        <i className={cls.markPrimary} />
        <i className={cls.markSecondary} />
      </div>
      <div className={cls.title}>{title}</div>
      {description && <div className={cls.text}>{description}</div>}
      {action}
    </div>
  );
});
