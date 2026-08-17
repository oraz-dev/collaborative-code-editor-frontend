import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import type { Collaborator } from '../model/types/collaborator';
import {
  removeCollaborator,
  shareDocument,
  updateCollaboratorRole,
  type RemoveCollaboratorInput,
  type ShareDocumentInput,
  type UpdateCollaboratorRoleInput,
} from './collaboratorApi';

/**
 * Grants access to a document and everything beneath it. Doubles as a role
 * change, since the API upserts rather than rejecting an existing collaborator.
 */
export function useShareDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ShareDocumentInput) => shareDocument(input),
    onSuccess: (_data, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators(documentId) });
    },
  });
}

export function useUpdateCollaboratorRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCollaboratorRoleInput) => updateCollaboratorRole(input),

    onMutate: async ({ documentId, userId, role }) => {
      const key = queryKeys.collaborators(documentId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<Collaborator[]>(key);
      queryClient.setQueryData<Collaborator[]>(key, (current) =>
        current?.map((entry) => (entry.userId === userId ? { ...entry, role } : entry)),
      );

      return { previous, key };
    },

    onError: (_error, _input, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },

    onSettled: (_data, _error, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators(documentId) });
    },
  });
}

export function useRemoveCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RemoveCollaboratorInput) => removeCollaborator(input),

    onMutate: async ({ documentId, userId }) => {
      const key = queryKeys.collaborators(documentId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<Collaborator[]>(key);
      queryClient.setQueryData<Collaborator[]>(key, (current) =>
        current?.filter((entry) => entry.userId !== userId),
      );

      return { previous, key };
    },

    onError: (_error, _input, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },

    onSettled: (_data, _error, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaborators(documentId) });
      // Removing yourself drops the document out of your shared list.
      queryClient.invalidateQueries({ queryKey: queryKeys.documentsSharedWithMe() });
    },
  });
}
