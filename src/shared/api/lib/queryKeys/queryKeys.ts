/**
 * Central key factory. Every cache read, invalidation and optimistic write
 * goes through here so key shapes can never drift between call sites.
 */
export const queryKeys = {
  session: ['session'] as const,
  currentUser: () => [...queryKeys.session, 'me'] as const,

  documents: ['documents'] as const,
  documentRoots: () => [...queryKeys.documents, 'roots'] as const,
  documentsSharedWithMe: () => [...queryKeys.documents, 'shared-with-me'] as const,
  collaborators: (documentId: string) => [...queryKeys.documents, 'collaborators', documentId] as const,
  documentChildren: (parentId: string) => [...queryKeys.documents, 'children', parentId] as const,
  document: (documentId: string) => [...queryKeys.documents, 'detail', documentId] as const,
  yjsState: (documentId: string) => [...queryKeys.documents, 'yjs-state', documentId] as const,
};
