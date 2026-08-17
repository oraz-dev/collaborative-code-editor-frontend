import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';

const MAX_QUERY_ATTEMPTS = 4;
const MAX_MUTATION_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 30_000;

/**
 * Exponential backoff with jitter, so a flaky connection recovering does not
 * cause every paused query to stampede the server on the same tick.
 */
function backoffWithJitter(attemptIndex: number): number {
  const base = Math.min(1000 * 2 ** attemptIndex, MAX_BACKOFF_MS);
  return base * (0.7 + Math.random() * 0.6);
}

function shouldRetry(failureCount: number, error: unknown, limit: number): boolean {
  // A deliberate 4xx (bad input, forbidden, not found) will never succeed on
  // a retry — only connection faults and 5xx are worth repeating.
  if (isApiError(error) && !error.isRetryable) return false;
  return failureCount < limit;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => shouldRetry(failureCount, error, MAX_QUERY_ATTEMPTS),
        retryDelay: backoffWithJitter,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        // 'online' parks fetches while the browser reports no link and
        // resumes them automatically once it returns.
        networkMode: 'online',
      },
      mutations: {
        retry: (failureCount, error) => shouldRetry(failureCount, error, MAX_MUTATION_ATTEMPTS),
        retryDelay: backoffWithJitter,
        // queued rather than failed when offline, then flushed on reconnect
        networkMode: 'online',
      },
    },
  });
}
