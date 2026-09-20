import { memo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { RoutePaths } from '@/shared/config/routeConfig/routeConfig';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { useSession } from '../../model/useSession';
import cls from './RequireGuest.module.scss';

interface RequireGuestProps {
  className?: string;
  children: ReactNode;
}

interface LocationState {
  from?: { pathname?: string };
}

/** Keeps an already signed-in user from landing back on the sign-in screen. */
export const RequireGuest = memo((props: RequireGuestProps) => {
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

  if (isAuthenticated) {
    const state = location.state as LocationState | null;
    return <Navigate to={state?.from?.pathname ?? RoutePaths.main} replace />;
  }

  return <>{children}</>;
});
