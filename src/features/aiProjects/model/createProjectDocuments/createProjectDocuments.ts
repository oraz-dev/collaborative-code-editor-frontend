import type { CreateDocumentInput, DocumentKind, WorkspaceDocument } from '@/entities/Document';
import { detectProjectEntry } from '@/features/preview';
import type { ProjectFile } from '../streamJson/streamJson';

/**
 * Turns a validated generation into real documents.
 *
 * The document service has no bulk endpoint and no transaction: a project is
 * N ordinary creates, each of which can fail on its own. Three things follow,
 * and they are the whole reason this is a module rather than a loop in a
 * component:
 *
 * - Order matters. A document needs its parent's id, so the root folder is
 *   created first, then every folder parents-first, then the files.
 * - A failure halfway leaves real documents behind. Hiding that would leave
 *   the user with a half-written project they cannot see, so the error carries
 *   everything that was created — the caller can open it, or offer to delete it.
 * - It has to be interruptible. The user may close the dialog mid-create, and
 *   an abort must stop at the next document rather than at the end.
 *
 * Nothing here calls the API directly: `createDocument` is injected, so the
 * caller decides whether that is the optimistic mutation or the bare client,
 * and the tests need no network at all.
 */

export type CreateDocumentFn = (input: CreateDocumentInput) => Promise<WorkspaceDocument>;

export interface CreatedDocument {
  /** Project-relative path; `''` for the project's own root folder. */
  path: string;
  id: string;
  kind: DocumentKind;
}

export interface CreateProjectProgress {
  /** Documents created so far, including the root folder. */
  done: number;
  total: number;
  /** The document just created. */
  path: string;
  kind: DocumentKind;
}

export interface CreateProjectInput {
  /** The project folder's name, as asked for; collisions are resolved here. */
  rootName: string;
  files: ProjectFile[];
  ownerId: string;
  createDocument: CreateDocumentFn;
  /** Names already used at the workspace root, so the new folder is distinct. */
  existingNames?: string[];
  /**
   * What an interrupted run already created, so a retry finishes that project
   * instead of building a second copy of it beside the half-written one.
   */
  resume?: CreatedDocument[];
  onProgress?: (progress: CreateProjectProgress) => void;
  signal?: AbortSignal;
}

export interface CreateProjectResult {
  rootId: string;
  /** The name actually used, which may be `name-2`. */
  rootName: string;
  /** The document to open: the project's entry, when it has one. */
  entryId: string | null;
  created: CreatedDocument[];
}

export class ProjectCreationError extends Error {
  /** Everything that reached the server before the failure, root folder first. */
  readonly created: CreatedDocument[];

  readonly rootId: string | null;

  /** The name the root folder actually got, which a retry must not resolve again. */
  readonly rootName: string;

  /** The document being created when it failed, or cancelled. */
  readonly path: string;

  readonly cancelled: boolean;

  constructor(params: {
    message: string;
    created: CreatedDocument[];
    rootName: string;
    path: string;
    cancelled?: boolean;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'ProjectCreationError';
    this.created = params.created;
    this.rootId = params.created[0]?.id ?? null;
    this.rootName = params.rootName;
    this.path = params.path;
    this.cancelled = params.cancelled ?? false;
  }
}

export function isProjectCreationError(error: unknown): error is ProjectCreationError {
  return error instanceof ProjectCreationError;
}

/** Trimmed, slash-free, and never empty — the service takes any string. */
function cleanName(name: string): string {
  const trimmed = name.trim().replace(/[\\/]+/g, '-').replace(/\s+/g, ' ');
  return trimmed || 'ai-project';
}

/**
 * `name`, or `name-2`, `name-3`… — what a file manager does, so two goes at
 * the same request do not produce two folders with one name.
 */
export function uniqueName(name: string, taken: readonly string[]): string {
  const base = cleanName(name);
  const used = new Set(taken.map((item) => item.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  // A thousand folders of one name is not a case worth a cleverer answer.
  return `${base}-${Date.now()}`;
}

/**
 * A model's path as one project-relative spelling.
 *
 * `/src/main.tsx`, `./src/main.tsx` and `src//main.tsx` all name the same file,
 * and rule 12 forbids all but the last — but models write them anyway, and the
 * folder map and the parent lookup have to agree on one of them or a file ends
 * up created at the workspace root, outside the project entirely.
 */
export function normalisePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

/**
 * Every folder the paths imply, parents before children.
 *
 * `src/components/Card.tsx` needs `src` and `src/components`, and the second
 * cannot be created until the first has an id.
 */
export function folderPaths(files: ProjectFile[]): string[] {
  const folders = new Set<string>();

  for (const file of files) {
    const segments = normalisePath(file.path).split('/');
    segments.pop();
    let prefix = '';
    for (const segment of segments) {
      if (!segment) continue;
      prefix = prefix ? `${prefix}/${segment}` : segment;
      folders.add(prefix);
    }
  }

  return [...folders].sort((a, b) => (
    a.split('/').length - b.split('/').length || a.localeCompare(b)
  ));
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function baseName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export async function createProjectDocuments(input: CreateProjectInput): Promise<CreateProjectResult> {
  const {
    rootName, files, ownerId, createDocument, existingNames = [], resume = [], onProgress, signal,
  } = input;

  const done = new Map(resume.map((document) => [document.path, document]));
  // Resolved here rather than by the caller: the name the user typed is what
  // they asked for, and "already taken" is a fact about the workspace, not
  // about the generation. A resumed run keeps the folder it already made.
  const name = done.has('') ? rootName : uniqueName(rootName, existingNames);

  const created: CreatedDocument[] = [...resume];
  /** Project path -> folder id, so a child knows its parent. `''` is the root. */
  const folderIds = new Map<string, string>();
  for (const document of resume) {
    if (document.kind === 'folder') folderIds.set(document.path, document.id);
  }

  const folders = folderPaths(files);
  const total = 1 + folders.length + files.length;

  const stopIfCancelled = (path: string): void => {
    if (!signal?.aborted) return;
    throw new ProjectCreationError({
      message: 'Creating the project was cancelled.',
      created: [...created],
      rootName: name,
      path,
      cancelled: true,
    });
  };

  const create = async (path: string, kind: DocumentKind, content?: string): Promise<string> => {
    const already = done.get(path);
    // A resumed run does not create what it already created; the document is
    // still reported, so the caller's counts and the entry lookup are whole.
    if (already) return already.id;

    stopIfCancelled(path);
    const parent = parentPath(path);
    const parentId = folderIds.get(parent) ?? null;
    if (path !== '' && parentId === null) {
      // Unreachable while `folderPaths` and `parentPath` read the same
      // normalised spelling — and a bug here used to create the document at the
      // workspace root, beside the user's own projects, rather than in the
      // project folder. Failing is the only safe answer.
      throw new ProjectCreationError({
        message: `Could not create "${path}": its folder "${parent}" is not part of this project.`,
        created: [...created],
        rootName: name,
        path,
      });
    }

    let document: WorkspaceDocument;
    try {
      document = await createDocument({
        name: path === '' ? name : baseName(path),
        kind,
        ownerId,
        ...(parentId ? { parentId } : {}),
        ...(content !== undefined ? { content } : {}),
      });
    } catch (error) {
      throw new ProjectCreationError({
        message: `Could not create "${path || name}": ${error instanceof Error ? error.message : String(error)}`,
        created: [...created],
        rootName: name,
        path,
        cause: error,
      });
    }

    created.push({ path, id: document.id, kind });
    onProgress?.({ done: created.length, total, path, kind });
    // An abort that landed while this create was in flight must not start the
    // next one; the document that did arrive is already recorded.
    stopIfCancelled(path);
    return document.id;
  };

  const rootId = await create('', 'folder');
  folderIds.set('', rootId);

  for (const folder of folders) {
    folderIds.set(folder, await create(folder, 'folder'));
  }

  // The normalised spelling throughout: the document tree is built from it, so
  // the entry lookup and the folder map have to be keyed by it too.
  const contents = files.map((file) => ({ path: normalisePath(file.path), content: file.content }));

  const fileIds = new Map<string, string>();
  for (const file of contents) {
    fileIds.set(file.path, await create(file.path, 'file', file.content));
  }

  const entry = detectProjectEntry(contents);

  return {
    rootId,
    rootName: name,
    entryId: entry ? fileIds.get(entry) ?? null : null,
    created,
  };
}
