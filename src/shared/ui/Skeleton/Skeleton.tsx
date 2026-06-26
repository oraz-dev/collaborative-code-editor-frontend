import { memo } from 'react';
import cls from './Skeleton.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  className?: string;
}

export const Skeleton = memo((props: SkeletonProps) => {
  const { width = '100%', height = 20, rounded = false, className } = props;

  const styles: React.CSSProperties = {
    width,
    height,
  };

  return (
    <span
      className={classNames(cls.skeleton, { [cls.rounded]: rounded }, [className])}
      style={styles}
    />
  );
});
