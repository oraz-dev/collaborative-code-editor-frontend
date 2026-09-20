import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import { fetchLanguages } from '../../api/languageApi';

/**
 * The languages this deployment can run.
 *
 * Effectively static — it only changes when the server's allowlist or its
 * sandbox image does — so it is cached for the session and never refetched on
 * focus. It is deliberately *not* fetched eagerly on app start: the answer is
 * only needed once an editor is open, and a stalled sandbox should not hold up
 * the dashboard.
 */
export function useLanguages(enabled = true) {
  return useQuery({
    queryKey: queryKeys.languages(),
    queryFn: ({ signal }) => fetchLanguages(signal),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    // A missing sandbox is a normal state to render, not something to hammer:
    // the Run button just reports that this file cannot run here.
    retry: 1,
  });
}
