import { memo, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { onSessionExpired, queryKeys } from '@/shared/api';
import { RoutePaths } from '@/shared/config/routeConfig/routeConfig';
import { logger } from '@/shared/lib/logger/logger';

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Reacts to a refresh that failed for good. Living here rather than in the
 * transport layer keeps `shared/api` free of any routing or cache dependency,
 * while still guaranteeing one consistent response to a lost session.
 */
export const SessionProvider = memo((props: SessionProviderProps) => {
  const { children } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => onSessionExpired(() => {
    logger.info('Session expired — returning to sign-in');
    queryClient.setQueryData(queryKeys.currentUser(), null);
    queryClient.removeQueries({ queryKey: queryKeys.documents });
    navigate(RoutePaths.auth, { replace: true });
  }), [navigate, queryClient]);

  return <>{children}</>;
});
