import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';
import type { User } from '../model/types/user';
import { fetchUsersByIds } from './userApi';

/**
 * Batch profile lookup, keyed on the sorted id list so the same set reuses one
 * cache entry regardless of the order it arrives in.
 */
export function useUsersByIds(ids: string[], enabled = true) {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort();

  return useQuery<User[]>({
    queryKey: ['users', 'by-ids', unique.join(',')],
    queryFn: ({ signal }) => fetchUsersByIds(unique, signal),
    enabled: enabled && unique.length > 0,
    staleTime: 5 * 60_000,
    retry: (failureCount, error) => isApiError(error) && error.isRetryable && failureCount < 2,
  });
}
