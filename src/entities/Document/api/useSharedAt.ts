import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import type { WorkspaceDocument } from '../model/types/document';
import { fetchCollaborators } from './collaboratorApi';

/**
 * When each shared document was actually shared *with you*.
 *
 * The `/shared-with-me` list carries only the document itself, whose
 * `updated_at` is the last time anyone edited it — showing that under "Shared
 * with me" reads as "you were given this yesterday" for a file that was shared
 * a minute ago. The grant timestamp lives on the collaborator record, so it is
 * read from there instead, one cached query per document.
 */
export function useSharedAt(
  documents: WorkspaceDocument[] | undefined,
  currentUserId: string | null | undefined,
): Map<string, string | null> {
  const list = documents ?? [];

  const results = useQueries({
    queries: list.map((document) => ({
      queryKey: queryKeys.collaborators(document.id),
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchCollaborators(document.id, signal),
      enabled: Boolean(currentUserId),
      // The grant only changes when someone re-shares, so this can sit still.
      staleTime: 5 * 60_000,
    })),
    combine: (queries) => {
      const sharedAt = new Map<string, string | null>();

      queries.forEach((query, index) => {
        const document = list[index];
        if (!document) return;

        const mine = query.data?.find((entry) => entry.userId === currentUserId);
        sharedAt.set(document.id, mine?.createdAt ?? null);
      });

      return sharedAt;
    },
  });

  return results;
}
