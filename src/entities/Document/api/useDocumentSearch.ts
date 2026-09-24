import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import {
  dedupeDocuments,
  documentLocation,
  indexDocuments,
  searchDocuments,
} from '../model/lib/searchDocuments';
import type { WorkspaceDocument } from '../model/types/document';
import { useDocumentRoots } from './documentQueries';

/**
 * Searches the documents we already hold: the roots plus every folder the user
 * has opened this session. The service exposes no search endpoint, so this
 * stays entirely client-side and costs no extra requests — results are instant,
 * and they widen naturally as the user browses.
 */
export interface DocumentHit {
  document: WorkspaceDocument;
  /** The folders it sits in, top down — what tells four `src` results apart. */
  location: string[];
}

export function useDocumentSearch(query: string, limit = 8): DocumentHit[] {
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

    const unique = dedupeDocuments(collected);
    // Every cached document, not just the matches: a match's parents are what
    // the location is walked through, and they rarely match the query.
    const byId = indexDocuments(unique);

    return searchDocuments(unique, query, limit).map((document) => ({
      document,
      location: documentLocation(document, byId),
    }));
  }, [queryClient, rootsQuery.data, query, limit]);
}
