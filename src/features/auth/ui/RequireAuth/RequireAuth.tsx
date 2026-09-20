import { memo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { RoutePaths } from '@/shared/config/routeConfig/routeConfig';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { useSession } from '../../model/useSession';
import cls from './RequireAuth.module.scss';

interface RequireAuthProps {
  className?: string;
  children: ReactNode;
}

/**
 * Blocks a protected route until the session is resolved. The pending state
 * matters: on a cold load the token is recovered from the refresh cookie, and
 * redirecting before that settles would bounce signed-in users to sign-in.
 */
export const RequireAuth = memo((props: RequireAuthProps) => {
  const { children } = props;
  const { isAuthenticated, isResolving } = useSession();
  const location = useLocation();

  if (isResolving) {
    return (
      <div className={cls.pending} role="status" aria-live="polite" aria-label="Restoring your session">
        <Spinner size="large" label="Checking your session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // `from` lets sign-in return the user to the page they actually wanted.
    return <Navigate to={RoutePaths.auth} state={{ from: location }} replace />;
  }

  return <>{children}</>;
});
