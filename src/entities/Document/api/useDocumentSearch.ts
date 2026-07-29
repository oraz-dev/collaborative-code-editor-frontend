import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import { dedupeDocuments, searchDocuments } from '../model/lib/searchDocuments';
import type { WorkspaceDocument } from '../model/types/document';
import { useDocumentRoots } from './documentQueries';

/**
 * Searches the documents we already hold: the roots plus every folder the user
 * has opened this session. The service exposes no search endpoint, so this
 * stays entirely client-side and costs no extra requests — results are instant,
 * and they widen naturally as the user browses.
 */
export function useDocumentSearch(query: string, limit = 8): WorkspaceDocument[] {
  const queryClient = useQueryClient();
  // Subscribing to roots keeps this recomputing as the workspace changes.
  const rootsQuery = useDocumentRoots();

  return useMemo(() => {
    const collected: WorkspaceDocument[] = [...(rootsQuery.data ?? [])];

    queryClient
      .getQueriesData<WorkspaceDocument[]>({ queryKey: queryKeys.documents })
      .forEach(([, data]) => {
        // Only the list queries hold arrays; detail and yjs-state entries do not.
        if (Array.isArray(data)) collected.push(...data);
      });

    return searchDocuments(dedupeDocuments(collected), query, limit);
  }, [queryClient, rootsQuery.data, query, limit]);
}
