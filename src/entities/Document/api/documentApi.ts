import { docsHttp } from '@/shared/api';
import { base64ToBytes } from '@/shared/lib/base64/base64';
import {
  mapDocument,
  mapDocuments,
  type DocumentDto,
  type DocumentKind,
  type WorkspaceDocument,
} from '../model/types/document';

export interface CreateDocumentInput {
  name: string;
  kind: DocumentKind;
  ownerId: string;
  parentId?: string | null;
  content?: string;
}

export interface WsTicket {
  ticket: string;
  expiresInMs: number;
}

export async function fetchRootDocuments(signal?: AbortSignal): Promise<WorkspaceDocument[]> {
  const dtos = await docsHttp<DocumentDto[]>('/documents/roots', { method: 'GET', signal });
  return mapDocuments(dtos);
}

export async function fetchChildDocuments(
  parentId: string,
  signal?: AbortSignal,
): Promise<WorkspaceDocument[]> {
  const dtos = await docsHttp<DocumentDto[]>(`/documents/${parentId}/children`, {
    method: 'GET',
    signal,
  });
  return mapDocuments(dtos);
}

export async function fetchDocument(
  documentId: string,
  signal?: AbortSignal,
): Promise<WorkspaceDocument> {
  const dto = await docsHttp<DocumentDto>(`/documents/${documentId}`, { method: 'GET', signal });
  return mapDocument(dto);
}

/**
 * The service does not validate `doc_type` and answers 500 for anything it does
 * not recognise, so the guard stays on this side of the wire.
 */
export async function createDocument(input: CreateDocumentInput): Promise<WorkspaceDocument> {
  if (input.kind !== 'file' && input.kind !== 'folder') {
    throw new Error(`Unsupported document type: ${input.kind}`);
  }

  const dto = await docsHttp<DocumentDto>('/documents', {
    method: 'POST',
    body: {
      doc_name: input.name,
      doc_type: input.kind,
      owner_id: input.ownerId,
      ...(input.parentId ? { parent_id: input.parentId } : {}),
      ...(input.content ? { content: input.content } : {}),
    },
  });

  return mapDocument(dto);
}

export async function updateDocumentContent(documentId: string, content: string): Promise<void> {
  await docsHttp<unknown>(`/documents/${documentId}/content`, {
    method: 'PATCH',
    body: { content },
  });
}

export async function moveDocument(documentId: string, newParentId: string): Promise<void> {
  await docsHttp<unknown>(`/documents/${documentId}/move`, {
    method: 'PATCH',
    body: { new_parent_id: newParentId },
  });
}

/** Soft-delete: the record is retained server-side but disappears from listings. */
export async function deleteDocument(documentId: string): Promise<void> {
  await docsHttp<unknown>(`/documents/${documentId}`, { method: 'DELETE' });
}

/**
 * Persisted CRDT state. Written as a byte array but read back as base64 — a
 * Go `[]byte` marshalling asymmetry, so the two directions differ on purpose.
 */
export async function fetchYjsState(
  documentId: string,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  const data = await docsHttp<{ state?: string | number[] | null }>(
    `/documents/${documentId}/yjs-state`,
    { method: 'GET', signal },
  );

  const state = data?.state;
  if (!state) return null;
  if (Array.isArray(state)) return Uint8Array.from(state);

  try {
    return base64ToBytes(state);
  } catch {
    // corrupt state should not block opening the document
    return null;
  }
}

export async function saveYjsState(documentId: string, state: Uint8Array): Promise<void> {
  await docsHttp<unknown>(`/documents/${documentId}/yjs-state`, {
    method: 'PATCH',
    body: { state: Array.from(state) },
  });
}

/**
 * One-time credential for the collaboration socket. These expire in ~15s, so a
 * ticket is minted per connection attempt rather than cached.
 */
export async function mintWsTicket(documentId: string): Promise<WsTicket> {
  const data = await docsHttp<{ ticket?: string; expires_in_ms?: number }>(
    `/documents/${documentId}/ws-ticket`,
    { method: 'POST' },
  );

  if (!data?.ticket) {
    throw new Error('The server did not return a collaboration ticket.');
  }

  return { ticket: data.ticket, expiresInMs: data.expires_in_ms ?? 15_000 };
}
