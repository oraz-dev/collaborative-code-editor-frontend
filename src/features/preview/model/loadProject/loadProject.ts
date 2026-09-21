import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';
import { hasModuleScript } from '../htmlPage/htmlPage';

/**
 * The slice of a workspace document the loader reads. Structural rather than
 * the entity's own type, so the loader is testable with plain objects and the
 * preview feature does not depend on how documents are fetched.
 */
export interface ProjectDocument {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'file' | 'folder';
  content: string;
}

/**
 * How the loader reaches the document service. Injected so the walk can be
 * tested without a network, and so the caller decides what may be cached:
 * ancestors may come from a cache, but children must be fetched fresh — their
 * contents are what runs.
 */
export interface ProjectFetchers {
  fetchDocument: (id: string, signal: AbortSignal) => Promise<ProjectDocument>;
  fetchChildren: (folderId: string, signal: AbortSignal) => Promise<ProjectDocument[]>;
  fetchRoots: (signal: AbortSignal) => Promise<ProjectDocument[]>;
}

export interface LoadProjectInput {
  /** The file open in the editor, which is the entry. */
  document: ProjectDocument;
  /** What is on screen now, which beats whatever the server last saved. */
  liveContent: string;
  fetchers: ProjectFetchers;
  signal?: AbortSignal;
  /** Defaults to `MAX_PROJECT_FILES`. */
  maxFiles?: number;
}

export interface LoadedProject {
  /** Paths relative to the project root folder, excluding its own name. */
  files: PreviewFile[];
  /** The open file's path within `files`. */
  entry: string;
  /** Name of the project root folder; empty when there is no folder above. */
  rootName: string;
  /** Id of the project root folder; null for a root-level file's project. */
  rootId: string | null;
  /** True when the file cap stopped the walk before the project was exhausted. */
  truncated: boolean;
  fileCount: number;
  /** Things the user should know about the load, for the preview console. */
  warnings: string[];
}

/**
 * Enough for any project someone would edit in a browser tab, and a bound on
 * how much one Run can ask of the server and inline into a `srcdoc`.
 */
export const MAX_PROJECT_FILES = 300;

/** A parent chain longer than this is a cycle in the data, not a real tree. */
const MAX_DEPTH = 64;

/**
 * Loads the project the open file belongs to, as the preview's file set.
 *
 * The project is everything under its root folder: the nearest ancestor of
 * the open file that looks like a project (see `projectMarker`), or, when none
 * does, the highest ancestor it can reach. The nearest, so a Vite app kept in
 * `Work/app-a/` is rooted at `app-a` — its `index.html` and `/src/main.tsx`
 * are where entry detection and root-absolute URLs expect them, and a sibling
 * `app-b` is neither walked nor counted against the file cap.
 *
 * There is no tree endpoint, so it is walked: up by `parentId`, listing
 * ancestors nearest first until one looks like a project, then down
 * breadth-first from the root, one request per folder (a listing already made
 * on the way up is reused), with every folder at one depth requested together
 * — a deep project costs round trips per level, not per folder.
 *
 * A file with no parent is a root-level file, and its project is the other
 * root-level *files*: the top level is everyone's loose files plus unrelated
 * projects, and descending into those would load things this file never
 * imports.
 *
 * Access limits are part of the model, not a failure: a file shared out of
 * someone else's folder cannot see above the share, and a subfolder may be
 * hidden. A 403 or 404 ends the walk up at the last folder that answered, and
 * a subfolder that refuses is skipped with a warning. Anything else — the
 * network, a 5xx — is a real failure and is thrown, as is an abort.
 */
export async function loadProject(input: LoadProjectInput): Promise<LoadedProject> {
  const {
    document, liveContent, fetchers, maxFiles = MAX_PROJECT_FILES,
  } = input;
  const signal = input.signal ?? new AbortController().signal;
  const warnings: string[] = [];

  throwIfAborted(signal);

  if (!document.parentId) {
    return loadRootLevel(document, liveContent, fetchers, signal, maxFiles, warnings);
  }

  // One request per folder, however many times the walk asks for it.
  const listings = new Map<string, Promise<ProjectDocument[]>>();
  const listChildren = (folderId: string) => {
    let listing = listings.get(folderId);
    if (!listing) {
      listing = fetchers.fetchChildren(folderId, signal);
      listings.set(folderId, listing);
    }
    return listing;
  };

  const ancestors = await findAncestors(document.parentId, fetchers, signal);
  const rootIndex = await chooseRoot(ancestors, listChildren, signal);
  const rootId = ancestors[rootIndex].id;
  const rootName = ancestors[rootIndex].name;
  // The root's own name is not part of any path inside it.
  const entryDirectory = ancestors.slice(0, rootIndex).map((folder) => folder.name).reverse().join('/');
  const entry = joinPath(entryDirectory, document.name);

  // The open file is reserved a place up front, so the cap can never be what
  // stops the file you pressed Run on from running.
  const files: PreviewFile[] = [{ path: entry, content: liveContent }];
  const taken = new Set([entry]);
  let truncated = false;

  let level: { id: string; path: string }[] = [{ id: rootId, path: '' }];
  // A folder listed twice (bad data, or a move mid-walk) is opened once.
  const opened = new Set([rootId]);
  let depth = 0;

  while (level.length > 0 && !truncated) {
    if (depth++ > MAX_DEPTH) break;

    const listings = await Promise.all(level.map(async (folder) => {
      try {
        return await listChildren(folder.id);
      } catch (error) {
        throwIfAborted(signal);
        if (!isAccessBoundary(error)) throw error;
        // The root itself refusing leaves the entry on its own, which still
        // runs; a subfolder refusing only costs what is inside it.
        warnings.push(folder.path
          ? `Skipped ${folder.path}/ — you do not have access to it.`
          : 'Could not list the files next to this one, so only this file was loaded.');
        return [];
      }
    }));
    throwIfAborted(signal);

    const next: { id: string; path: string }[] = [];

    listings.forEach((children, index) => {
      const parent = level[index];
      for (const child of byName(children)) {
        const path = joinPath(parent.path, child.name);

        if (child.kind === 'folder') {
          if (!opened.has(child.id)) {
            opened.add(child.id);
            next.push({ id: child.id, path });
          }
          continue;
        }

        if (child.id === document.id || taken.has(path)) continue;
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }

        taken.add(path);
        files.push({ path, content: child.content });
      }
    });

    // Full, with folders still unopened: they may well hold more files, and
    // opening them just to count what will not be loaded is not worth it.
    if (files.length >= maxFiles && next.length > 0) truncated = true;
    level = next;
  }

  if (truncated) warnings.push(truncationWarning(maxFiles));

  return {
    files, entry, rootName, rootId, truncated, fileCount: files.length, warnings,
  };
}

/** The message shown when the cap cut the project short. */
export function truncationWarning(maxFiles: number): string {
  return `This project has more than ${maxFiles} files, so only the first ${maxFiles} were loaded. `
    + 'Imports of anything past that will fail.';
}

interface Ancestor {
  id: string;
  /** Empty for a parent that could not be looked up. */
  name: string;
}

/**
 * The open file's folder ancestors, nearest first, up to the highest one it
 * can see. When not even the parent answers, the parent is still the only
 * ancestor — a file's parent is a folder by definition — only without a name.
 */
async function findAncestors(
  parentId: string,
  fetchers: ProjectFetchers,
  signal: AbortSignal,
): Promise<Ancestor[]> {
  const chain: Ancestor[] = [];
  const seen = new Set<string>();
  let nextId: string | null = parentId;

  while (nextId && !seen.has(nextId) && seen.size < MAX_DEPTH) {
    seen.add(nextId);

    let folder: ProjectDocument;
    try {
      folder = await fetchers.fetchDocument(nextId, signal);
    } catch (error) {
      throwIfAborted(signal);
      if (isAccessBoundary(error)) break;
      throw error;
    }
    throwIfAborted(signal);

    // Anything that is not the folder asked for is no ancestor to build on.
    if (folder.kind !== 'folder' || folder.id !== nextId) break;

    chain.push({ id: folder.id, name: folder.name });
    nextId = folder.parentId;
  }

  return chain.length > 0 ? chain : [{ id: parentId, name: '' }];
}

const VITE_CONFIG = /^vite\.config\.[cm]?[jt]s$/i;

/**
 * How strongly a folder's listing says "a project starts here".
 *
 * `strong`: a `package.json`, a `vite.config.*`, or an `index.html` that
 * loads a module by `src` — what Vite roots itself at. `weak`: any other
 * `index.html`, the root of a plain HTML site.
 */
export function projectMarker(children: ProjectDocument[]): 'strong' | 'weak' | null {
  let weak = false;
  for (const child of children) {
    if (child.kind !== 'file') continue;
    if (child.name === 'package.json' || VITE_CONFIG.test(child.name)) return 'strong';
    if (child.name === 'index.html') {
      if (hasModuleScript(child.content)) return 'strong';
      weak = true;
    }
  }
  return weak ? 'weak' : null;
}

/**
 * Which ancestor is the project root: the nearest with a strong marker, else
 * the nearest with a weak one, else the highest. Listed nearest first, and
 * no further than a strong marker. A folder that refuses to be listed simply
 * does not look like a project; the walk down reports it if it is the root.
 */
async function chooseRoot(
  ancestors: Ancestor[],
  listChildren: (folderId: string) => Promise<ProjectDocument[]>,
  signal: AbortSignal,
): Promise<number> {
  if (ancestors.length === 1) return 0;
  let weak = -1;

  for (let index = 0; index < ancestors.length; index += 1) {
    let children: ProjectDocument[];
    try {
      children = await listChildren(ancestors[index].id);
    } catch (error) {
      throwIfAborted(signal);
      if (!isAccessBoundary(error)) throw error;
      continue;
    }
    throwIfAborted(signal);

    const marker = projectMarker(children);
    if (marker === 'strong') return index;
    if (marker === 'weak' && weak === -1) weak = index;
  }

  return weak === -1 ? ancestors.length - 1 : weak;
}

async function loadRootLevel(
  document: ProjectDocument,
  liveContent: string,
  fetchers: ProjectFetchers,
  signal: AbortSignal,
  maxFiles: number,
  warnings: string[],
): Promise<LoadedProject> {
  const entry = document.name;
  const files: PreviewFile[] = [{ path: entry, content: liveContent }];
  let truncated = false;

  let roots: ProjectDocument[] = [];
  try {
    roots = await fetchers.fetchRoots(signal);
  } catch (error) {
    throwIfAborted(signal);
    if (!isAccessBoundary(error)) throw error;
    warnings.push('Could not list the files next to this one, so only this file was loaded.');
  }
  throwIfAborted(signal);

  const taken = new Set([entry]);
  for (const root of byName(roots)) {
    if (root.kind !== 'file' || root.id === document.id || taken.has(root.name)) continue;
    if (files.length >= maxFiles) {
      truncated = true;
      break;
    }
    taken.add(root.name);
    files.push({ path: root.name, content: root.content });
  }

  if (truncated) warnings.push(truncationWarning(maxFiles));

  return {
    files, entry, rootName: '', rootId: null, truncated, fileCount: files.length, warnings,
  };
}

/**
 * 403 and 404 mark the edge of what this user can see — expected, with
 * sharing — rather than something having gone wrong. Read structurally so the
 * loader does not depend on the HTTP client's error class.
 */
export function isAccessBoundary(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 403 || status === 404;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  // The HTTP client reports a caller's abort as its own error kind.
  return (error as { kind?: unknown } | null)?.kind === 'aborted';
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('The project load was cancelled.', 'AbortError');
}

/** Listing order is the server's; sorting makes the cap cut the same files every time. */
function byName(documents: ProjectDocument[]): ProjectDocument[] {
  return [...documents].sort((a, b) => a.name.localeCompare(b.name));
}

function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}
