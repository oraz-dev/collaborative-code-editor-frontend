import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isApiError, queryKeys, refreshAccessToken, tokenStore } from '@/shared/api';
import { fetchCurrentUser, type User } from '@/entities/User';

/**
 * Resolves the current session, silently recovering it from the refresh cookie
 * on a cold load. `null` means "definitely signed out" — an error is reserved
 * for connection problems, so a flaky network never logs anybody out.
 */
async function resolveSession(signal?: AbortSignal): Promise<User | null> {
  if (!tokenStore.get()) {
    const token = await refreshAccessToken();
    if (!token) return null;
  }

  try {
    return await fetchCurrentUser(signal);
  } catch (error) {
    // The client already retried once behind a refresh; a surviving 401/404
    // means there is genuinely no session to restore.
    if (isApiError(error) && (error.isUnauthorized || error.isNotFound)) {
      return null;
    }
    throw error;
  }
}

export interface SessionState {
  user: User | null;
  isAuthenticated: boolean;
  isResolving: boolean;
  error: unknown;
  query: UseQueryResult<User | null>;
}

export function useSession(): SessionState {
  const query = useQuery({
    queryKey: queryKeys.currentUser(),
    queryFn: ({ signal }) => resolveSession(signal),
    staleTime: Infinity,
    // A signed-out visitor is a valid answer, not something to retry.
    retry: (failureCount, error) => isApiError(error) && error.isRetryable && failureCount < 3,
  });

  return {
    user: query.data ?? null,
    isAuthenticated: Boolean(query.data),
    isResolving: query.isPending,
    error: query.error,
    query,
  };
}
