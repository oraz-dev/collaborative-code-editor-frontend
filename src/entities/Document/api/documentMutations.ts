import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import type { WorkspaceDocument } from '../model/types/document';
import {
  createDocument,
  deleteDocument,
  renameDocument,
  type CreateDocumentInput,
} from './documentApi';

/** Roots and children live under different keys; siblings share whichever applies. */
function siblingListKey(parentId: string | null) {
  return parentId ? queryKeys.documentChildren(parentId) : queryKeys.documentRoots();
}

function readList(client: QueryClient, parentId: string | null): WorkspaceDocument[] | undefined {
  return client.getQueryData<WorkspaceDocument[]>(siblingListKey(parentId));
}

function writeList(client: QueryClient, parentId: string | null, value: WorkspaceDocument[] | undefined) {
  client.setQueryData(siblingListKey(parentId), value);
}

const TEMP_ID_PREFIX = 'optimistic:';

export function isOptimisticDocument(document: WorkspaceDocument): boolean {
  return document.id.startsWith(TEMP_ID_PREFIX);
}

/**
 * Creates a document, showing it in the tree immediately. The placeholder
 * carries a marked id so views can render it as pending and refuse to open it
 * until the server hands back the real one.
 */
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDocument,

    onMutate: async (input: CreateDocumentInput) => {
      const parentId = input.parentId ?? null;
      const key = siblingListKey(parentId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = readList(queryClient, parentId);
      const placeholder: WorkspaceDocument = {
        id: `${TEMP_ID_PREFIX}${input.name}`,
        ownerId: input.ownerId,
        parentId,
        name: input.name,
        kind: input.kind,
        content: input.content ?? '',
        createdAt: null,
        updatedAt: null,
      };

      writeList(queryClient, parentId, [...(previous ?? []), placeholder]);
      return { previous, parentId };
    },

    onError: (_error, _input, context) => {
      if (context) writeList(queryClient, context.parentId, context.previous);
    },

    onSettled: (_data, _error, input) => {
      // the create response carries zero-value timestamps, so refetch for truth
      queryClient.invalidateQueries({ queryKey: siblingListKey(input.parentId ?? null) });
    },
  });
}

export interface DeleteDocumentInput {
  documentId: string;
  parentId: string | null;
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId }: DeleteDocumentInput) => deleteDocument(documentId),

    onMutate: async ({ documentId, parentId }) => {
      const key = siblingListKey(parentId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = readList(queryClient, parentId);
      writeList(queryClient, parentId, previous?.filter((item) => item.id !== documentId));
      return { previous, parentId };
    },

    onError: (_error, _input, context) => {
      if (context) writeList(queryClient, context.parentId, context.previous);
    },

    onSuccess: (_data, { documentId }) => {
      queryClient.removeQueries({ queryKey: queryKeys.document(documentId) });
      queryClient.removeQueries({ queryKey: queryKeys.documentChildren(documentId) });
    },

    onSettled: (_data, _error, { parentId }) => {
      queryClient.invalidateQueries({ queryKey: siblingListKey(parentId) });
    },
  });
}

export interface RenameDocumentInput {
  document: WorkspaceDocument;
  name: string;
}

/** Renames in place, showing the new name before the server confirms it. */
export function useRenameDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ document, name }: RenameDocumentInput) => renameDocument(document.id, name),

    onMutate: async ({ document, name }) => {
      const key = siblingListKey(document.parentId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = readList(queryClient, document.parentId);
      writeList(
        queryClient,
        document.parentId,
        previous?.map((item) => (item.id === document.id ? { ...item, name } : item)),
      );

      const previousDetail = queryClient.getQueryData<WorkspaceDocument>(
        queryKeys.document(document.id),
      );
      queryClient.setQueryData<WorkspaceDocument>(queryKeys.document(document.id), (current) =>
        current ? { ...current, name } : current,
      );

      return { previous, previousDetail, parentId: document.parentId, documentId: document.id };
    },

    onError: (_error, _input, context) => {
      if (!context) return;
      writeList(queryClient, context.parentId, context.previous);
      queryClient.setQueryData(queryKeys.document(context.documentId), context.previousDetail);
    },

    onSettled: (_data, _error, { document }) => {
      queryClient.invalidateQueries({ queryKey: siblingListKey(document.parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.document(document.id) });
    },
  });
}
