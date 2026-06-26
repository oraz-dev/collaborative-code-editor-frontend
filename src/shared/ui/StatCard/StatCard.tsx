import { memo, type ReactNode } from 'react';
import cls from './StatCard.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon } from '@/shared/ui/Icon/Icon';

type TrendDirection = 'up' | 'down';

interface StatCardProps {
  label: string;
  value: ReactNode;
  trend?: {
    direction: TrendDirection;
    text: string;
  };
  className?: string;
}

export const StatCard = memo((props: StatCardProps) => {
  const { label, value, trend, className } = props;

  return (
    <div className={classNames(cls.statCard, {}, [className])}>
      <div className={cls.label}>{label}</div>
      <div className={cls.value}>{value}</div>
      {trend && (
        <div className={classNames(cls.trend, { [cls[trend.direction]]: true })}>
          <Icon
            name="arrow"
            className={trend.direction === 'up' ? cls.trendIconUp : cls.trendIconDown}
          />
          {trend.text}
        </div>
      )}
    </div>
  );
});
