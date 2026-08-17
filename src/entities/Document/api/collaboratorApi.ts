import { docsHttp } from '@/shared/api';
import {
  mapCollaborators,
  type Collaborator,
  type CollaboratorDto,
  type DocumentRole,
} from '../model/types/collaborator';

/**
 * Direct grants only — someone who reaches this document through a shared
 * ancestor folder is listed on that folder, not here.
 */
export async function fetchCollaborators(
  documentId: string,
  signal?: AbortSignal,
): Promise<Collaborator[]> {
  const dtos = await docsHttp<CollaboratorDto[]>(`/documents/${documentId}/collaborators`, {
    method: 'GET',
    signal,
  });
  return mapCollaborators(dtos);
}

export interface ShareDocumentInput {
  documentId: string;
  userId: string;
  role: Exclude<DocumentRole, 'owner'>;
}

/**
 * Grants access to this document and everything beneath it. Owner only.
 * Sharing with someone who already has access updates their role rather than
 * failing, so this doubles as an upsert.
 */
export async function shareDocument({ documentId, userId, role }: ShareDocumentInput): Promise<void> {
  await docsHttp<unknown>(`/documents/${documentId}/collaborators`, {
    method: 'POST',
    body: { user_id: userId, role },
  });
}

export interface UpdateCollaboratorRoleInput {
  documentId: string;
  userId: string;
  role: Exclude<DocumentRole, 'owner'>;
}

/** Promote or demote between editor and viewer. Owner only. */
export async function updateCollaboratorRole({
  documentId,
  userId,
  role,
}: UpdateCollaboratorRoleInput): Promise<void> {
  await docsHttp<unknown>(`/documents/${documentId}/collaborators/${userId}`, {
    method: 'PATCH',
    body: { role },
  });
}

export interface RemoveCollaboratorInput {
  documentId: string;
  userId: string;
}

/**
 * The owner can remove anyone; a collaborator can remove themselves, which is
 * how "leave this document" works without involving the owner.
 */
export async function removeCollaborator({
  documentId,
  userId,
}: RemoveCollaboratorInput): Promise<void> {
  await docsHttp<unknown>(`/documents/${documentId}/collaborators/${userId}`, {
    method: 'DELETE',
  });
}
