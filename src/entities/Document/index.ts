export {
  createDocument,
  deleteDocument,
  fetchChildDocuments,
  fetchDocument,
  fetchRootDocuments,
  fetchYjsState,
  mintWsTicket,
  moveDocument,
  saveYjsState,
  updateDocumentContent,
} from './api/documentApi';
export type { CreateDocumentInput, WsTicket } from './api/documentApi';

export { useDocument, useDocumentChildren, useDocumentRoots } from './api/documentQueries';
export {
  isOptimisticDocument,
  useCreateDocument,
  useDeleteDocument,
  useMoveDocument,
  useUpdateDocumentContent,
} from './api/documentMutations';
export type {
  DeleteDocumentInput,
  MoveDocumentInput,
  UpdateContentInput,
} from './api/documentMutations';

export { mapDocument, mapDocuments, sortDocuments, toDocumentKind } from './model/types/document';
export type { DocumentDto, DocumentKind, WorkspaceDocument } from './model/types/document';
