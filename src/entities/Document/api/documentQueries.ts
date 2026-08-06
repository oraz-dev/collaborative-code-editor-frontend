import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import { sortCollaborators } from '../model/types/collaborator';
import { sortDocuments, type WorkspaceDocument } from '../model/types/document';
import { fetchCollaborators } from './collaboratorApi';
import {
  fetchChildDocuments,
  fetchDocument,
  fetchRootDocuments,
  fetchSharedDocuments,
} from './documentApi';

/** Top level of the workspace tree. */
export function useDocumentRoots() {
  return useQuery({
    queryKey: queryKeys.documentRoots(),
    queryFn: ({ signal }) => fetchRootDocuments(signal),
    select: sortDocuments,
  });
}

/**
 * Children are fetched per folder as it opens rather than as one deep tree,
 * which keeps the first paint cheap on a slow link and lets each branch retry
 * on its own.
 */
export function useDocumentChildren(parentId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.documentChildren(parentId ?? ''),
    queryFn: ({ signal }) => fetchChildDocuments(parentId as string, signal),
    enabled: Boolean(parentId) && enabled,
    select: sortDocuments,
  });
}

/**
 * Documents other people have shared with the signed-in user.
 *
 * Polled, because nothing pushes a new grant to the client: without it a share
 * only appears after a reload, and the "shared with you" alert would never
 * fire while you were sitting on the page it concerns.
 */
export function useSharedDocuments() {
  return useQuery({
    queryKey: queryKeys.documentsSharedWithMe(),
    queryFn: ({ signal }) => fetchSharedDocuments(signal),
    select: sortDocuments,
    refetchInterval: 60_000,
  });
}

/** Direct grants on a document — used by the share dialog. */
export function useCollaborators(documentId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.collaborators(documentId ?? ''),
    queryFn: ({ signal }) => fetchCollaborators(documentId as string, signal),
    enabled: Boolean(documentId) && enabled,
    select: sortCollaborators,
  });
}

export function useDocument(documentId: string | null | undefined) {
  return useQuery<WorkspaceDocument>({
    queryKey: queryKeys.document(documentId ?? ''),
    queryFn: ({ signal }) => fetchDocument(documentId as string, signal),
    enabled: Boolean(documentId),
  });
}
