import { memo } from 'react';
import type { AppRoutes } from '@/shared/config/routeConfig/routeConfig';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Link, type LinkProps } from 'react-router';

interface AppLinkProps extends Omit<LinkProps, 'to'> {
  className?: string;
  children?: React.ReactNode;
  to: AppRoutes;
}

export const AppLink = memo((props: AppLinkProps) => {
  const {
    to,
    className,
    children,
    ...otherProps
  } = props;

  return (
    <Link
      to={to as AppRoutes}
      className={classNames('', {}, [className])}
      {...otherProps}
    >
      {children}
    </Link>
  );
});
