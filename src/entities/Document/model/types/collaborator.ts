/**
 * Access is a three-level ladder. `owner` is fixed at creation and cannot be
 * granted, handed over, or demoted — only `editor` and `viewer` are shareable.
 *
 * A grant applies to the document *and everything beneath it*, so access to a
 * folder reaches every file inside it.
 */
export type DocumentRole = 'owner' | 'editor' | 'viewer';

/** The roles the API will actually accept in a share request. */
export type GrantableRole = Exclude<DocumentRole, 'owner'>;

export const GRANTABLE_ROLES: GrantableRole[] = ['editor', 'viewer'];

export const GRANTABLE_ROLE_LABELS: Record<GrantableRole, string> = {
  editor: 'Can edit',
  viewer: 'Can view',
};

/** Narrows a raw select value, defaulting to the safer of the two. */
export function toGrantableRole(value: string): GrantableRole {
  return value === 'viewer' ? 'viewer' : 'editor';
}

export interface CollaboratorDto {
  user_id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  role?: string;
  created_at?: string;
}

export interface Collaborator {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: DocumentRole;
  createdAt: string | null;
}

const ROLE_RANK: Record<DocumentRole, number> = { owner: 0, editor: 1, viewer: 2 };

export function toDocumentRole(value?: string): DocumentRole {
  if (value === 'owner' || value === 'editor') return value;
  // Anything unrecognised is treated as the least privileged option, so an
  // unexpected value can never silently hand out write access.
  return 'viewer';
}

export function canEditWithRole(role: DocumentRole): boolean {
  return role === 'owner' || role === 'editor';
}

/**
 * Profile fields are resolved from the auth service and come back empty when
 * it is unreachable — only `user_id` and `role` are guaranteed, so the display
 * name falls back through username to a truncated id rather than rendering blank.
 */
export function mapCollaborator(dto: CollaboratorDto): Collaborator {
  const userId = dto.user_id ?? '';

  return {
    userId,
    username: dto.username ?? '',
    displayName: dto.display_name || dto.username || (userId ? `User ${userId.slice(0, 8)}` : 'Unknown'),
    avatarUrl: dto.avatar_url || null,
    role: toDocumentRole(dto.role),
    createdAt: dto.created_at && !dto.created_at.startsWith('0001-01-01') ? dto.created_at : null,
  };
}

export function mapCollaborators(dtos: CollaboratorDto[] | null | undefined): Collaborator[] {
  if (!Array.isArray(dtos)) return [];
  return dtos.map(mapCollaborator);
}

/** The API already returns most-privileged-first; this keeps that stable locally. */
export function sortCollaborators(collaborators: Collaborator[]): Collaborator[] {
  return [...collaborators].sort((a, b) => {
    if (a.role !== b.role) return ROLE_RANK[a.role] - ROLE_RANK[b.role];
    return a.displayName.localeCompare(b.displayName);
  });
}
