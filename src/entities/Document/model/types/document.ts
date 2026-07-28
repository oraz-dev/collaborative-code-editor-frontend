export type DocumentKind = 'file' | 'folder';

/**
 * Wire shape from the document service. Note the asymmetry with the request
 * bodies, which use `doc_name` / `doc_type` — responses drop the underscore.
 */
export interface DocumentDto {
  id?: string;
  owner_id?: string;
  parent_id?: string;
  docname?: string;
  doctype?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface WorkspaceDocument {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  kind: DocumentKind;
  content: string;
  createdAt: string | null;
  updatedAt: string | null;
}

const ZERO_TIME_PREFIX = '0001-01-01';

function normaliseTime(value?: string): string | null {
  if (!value || value.startsWith(ZERO_TIME_PREFIX)) return null;
  return value;
}

/** Anything that is not explicitly a folder is treated as an editable file. */
export function toDocumentKind(value?: string): DocumentKind {
  return value === 'folder' ? 'folder' : 'file';
}

export function mapDocument(dto: DocumentDto): WorkspaceDocument {
  return {
    id: dto.id ?? '',
    ownerId: dto.owner_id ?? '',
    // the service omits parent_id for roots rather than sending null
    parentId: dto.parent_id || null,
    name: dto.docname ?? 'Untitled',
    kind: toDocumentKind(dto.doctype),
    content: dto.content ?? '',
    createdAt: normaliseTime(dto.created_at),
    updatedAt: normaliseTime(dto.updated_at),
  };
}

export function mapDocuments(dtos: DocumentDto[] | null | undefined): WorkspaceDocument[] {
  if (!Array.isArray(dtos)) return [];
  return dtos.map(mapDocument);
}

/** Folders first, then alphabetical — the ordering every file tree expects. */
export function sortDocuments(documents: WorkspaceDocument[]): WorkspaceDocument[] {
  return [...documents].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
