import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';
import type { User } from '../model/types/user';
import { searchUsers } from './userApi';

/** Long enough to avoid a request per keystroke while typing a username. */
const MIN_QUERY_LENGTH = 2;

/**
 * Looks up people to share with. Kept separate from the session query so a
 * failed search never disturbs who is signed in.
 */
export function useUserSearch(query: string, enabled = true) {
  const trimmed = query.trim();

  return useQuery<User[]>({
    queryKey: ['users', 'search', trimmed],
    queryFn: ({ signal }) => searchUsers(trimmed, signal),
    enabled: enabled && trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    retry: (failureCount, error) => isApiError(error) && error.isRetryable && failureCount < 2,
  });
}
