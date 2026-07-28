import { memo, useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createAppQueryClient } from './queryClient';

interface QueryProviderProps {
  children: ReactNode;
  /** Injectable so tests can supply a client with retries disabled. */
  client?: QueryClient;
}

export const QueryProvider = memo((props: QueryProviderProps) => {
  const { children, client } = props;
  const [fallbackClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={client ?? fallbackClient}>
      {children}
    </QueryClientProvider>
  );
});
