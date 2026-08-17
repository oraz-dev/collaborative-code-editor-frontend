import { memo } from 'react';
import type { AppRoute } from '@/shared/config/routeConfig/routeConfig';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Link, type LinkProps } from 'react-router';

interface AppLinkProps extends Omit<LinkProps, 'to'> {
  className?: string;
  children?: React.ReactNode;
  to: AppRoute | string;
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
      to={to}
      className={classNames('', {}, [className])}
      {...otherProps}
    >
      {children}
    </Link>
  );
});
