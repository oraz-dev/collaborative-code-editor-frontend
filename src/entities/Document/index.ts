export {
  createDocument,
  deleteDocument,
  fetchChildDocuments,
  fetchDocument,
  fetchRootDocuments,
  fetchSharedDocuments,
  fetchYjsState,
  mintWsTicket,
  renameDocument,
  saveYjsState,
  updateDocumentContent,
} from './api/documentApi';
export type { CreateDocumentInput, WsTicket } from './api/documentApi';

export {
  fetchCollaborators,
  removeCollaborator,
  shareDocument,
  updateCollaboratorRole,
} from './api/collaboratorApi';
export type {
  RemoveCollaboratorInput,
  ShareDocumentInput,
  UpdateCollaboratorRoleInput,
} from './api/collaboratorApi';

export {
  useCollaborators,
  useDocument,
  useDocumentChildren,
  useDocumentRoots,
  useSharedDocuments,
} from './api/documentQueries';
export { useDocumentSearch } from './api/useDocumentSearch';
export { dedupeDocuments, searchDocuments } from './model/lib/searchDocuments';

export {
  isOptimisticDocument,
  useCreateDocument,
  useDeleteDocument,
  useRenameDocument,
} from './api/documentMutations';
export type {
  DeleteDocumentInput,
  RenameDocumentInput,
} from './api/documentMutations';

export {
  useRemoveCollaborator,
  useShareDocument,
  useUpdateCollaboratorRole,
} from './api/collaboratorMutations';

export { mapDocument, mapDocuments, sortDocuments, toDocumentKind } from './model/types/document';
export type { DocumentDto, DocumentKind, WorkspaceDocument } from './model/types/document';

export {
  canEditWithRole,
  GRANTABLE_ROLES,
  GRANTABLE_ROLE_LABELS,
  toGrantableRole,
  mapCollaborator,
  mapCollaborators,
  sortCollaborators,
  toDocumentRole,
} from './model/types/collaborator';
export type { Collaborator, CollaboratorDto, DocumentRole, GrantableRole } from './model/types/collaborator';
