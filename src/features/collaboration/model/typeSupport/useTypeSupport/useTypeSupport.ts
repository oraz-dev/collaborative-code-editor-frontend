import { useEffect, useSyncExternalStore } from 'react';
import type { editor } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import { logger } from '@/shared/lib/logger/logger';
import {
  acquireTypes,
  scanImports,
  type TypeFetcher,
  type TypeRequest,
} from '../acquireTypes/acquireTypes';
import { compilerOptions, projectLibs, type ProjectSource } from '../editorLibs/editorLibs';
import { createTypeFetcher } from '../typeFetcher/typeFetcher';
import { TypeRegistry, type LanguageDefaults } from '../typeRegistry/typeRegistry';
import { TypeProgressStore, type TypeProgressSnapshot } from '../typeProgress/typeProgress';

/**
 * The project around the open file, as the editor's type checker needs it.
 * Built by the page from the same loader and rules the preview runs with.
 */
export interface EditorProject {
  /** Tells projects with the same paths apart: the root folder's id. */
  key: string;
  /** The open file's path in the project, e.g. `src/components/Clock.tsx`. */
  path: string;
  files: ProjectSource[];
  packages: TypeRequest[];
  /** tsconfig `paths`, relative to the project root. */
  paths: Record<string, string[]>;
  strict: boolean;
  usesJsx: boolean;
}

/** Monaco 0.55 moved the TypeScript API to a top-level namespace; older builds keep it on `languages`. */
function languageDefaults(monaco: Monaco): LanguageDefaults[] | null {
  const modern = (monaco as { typescript?: { typescriptDefaults?: unknown; javascriptDefaults?: unknown } }).typescript;
  const legacy = (monaco.languages as { typescript?: { typescriptDefaults?: unknown; javascriptDefaults?: unknown } }).typescript;
  const api = modern?.typescriptDefaults ? modern : legacy;
  if (!api?.typescriptDefaults || !api.javascriptDefaults) return null;
  return [api.typescriptDefaults as LanguageDefaults, api.javascriptDefaults as LanguageDefaults];
}

/** React's JSX runtime is what `react-jsx` compiles to, whether or not a file imports React. */
export function typeRequests(project: EditorProject): TypeRequest[] {
  const requests = project.packages.map((request) => ({ ...request, subpaths: [...(request.subpaths ?? [])] }));
  if (!project.usesJsx) return requests;

  let react = requests.find((request) => request.name === 'react');
  if (!react) {
    react = { name: 'react', range: '', subpaths: [] };
    requests.push(react);
  }
  if (!react.subpaths?.includes('jsx-runtime')) react.subpaths = [...(react.subpaths ?? []), 'jsx-runtime'];
  return requests;
}

// One per app: Monaco's language defaults are global, and so is what was fetched.
const registry = new TypeRegistry();
let fetcher: TypeFetcher | null = null;
/** Packages with types registered, by name. */
const typed = new Set<string>();
/** Acquisitions started, by package and subpaths, so none is fetched twice. */
const started = new Map<string, Promise<void>>();
let wanted: string[] = [];
/** The latest request per package, so a failed one can be retried as it was asked. */
const lastRequest = new Map<string, TypeRequest>();
const progress = new TypeProgressStore();

function setWanted(names: string[]): void {
  wanted = names;
  progress.setWanted(names);
}

/**
 * How long typing must pause before the open file's imports are re-read.
 * Long enough that `'react-d'`, half typed between auto-closed quotes, is
 * rarely taken for a package — and if it is, the cost is one package's types.
 */
const RESCAN_DELAY_MS = 1500;

/**
 * Packages the open file imports right now, beyond those the project snapshot
 * listed — an import typed a moment ago gets its types without reopening the
 * file. A path alias such as `@/hooks/x` is the project's own, not a package.
 */
export function liveRequests(source: string, project: EditorProject): TypeRequest[] {
  const aliasPrefixes = Object.keys(project.paths).map((pattern) => pattern.replace(/\*$/, ''));
  const ranges = new Map(project.packages.map((request) => [request.name, request.range]));
  const requests = new Map<string, TypeRequest>();

  for (const specifier of scanImports(source)) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) continue;
    if (aliasPrefixes.some((prefix) => prefix && (specifier === prefix || specifier.startsWith(prefix)))) continue;

    const parts = specifier.split('/');
    const size = specifier.startsWith('@') ? 2 : 1;
    const name = parts.slice(0, size).join('/');
    const subpath = parts.slice(size).join('/');
    const request = requests.get(name) ?? { name, range: ranges.get(name) ?? '', subpaths: [] };
    if (subpath && !request.subpaths?.includes(subpath)) request.subpaths = [...(request.subpaths ?? []), subpath];
    requests.set(name, request);
  }

  return [...requests.values()];
}

function requestKey(request: TypeRequest): string {
  return `${request.name}|${[...(request.subpaths ?? [])].sort().join(',')}`;
}

function markUntyped(): void {
  registry.setUntyped(wanted.filter((name) => !typed.has(name)));
}

function acquire(request: TypeRequest): void {
  const key = requestKey(request);
  if (started.has(key)) return;
  lastRequest.set(request.name, request);

  // A new subpath of a package that already has types fills in quietly: the
  // package is usable meanwhile, and a bar restarting at 0 would say it is not.
  const visible = !typed.has(request.name);
  if (visible) progress.start(request.name);

  fetcher ??= createTypeFetcher();
  const job = acquireTypes([request], fetcher, {
    onProgress: visible ? (update) => progress.update(request.name, update) : undefined,
  })
    .then((result) => {
      registry.addPackageFiles(result.files);
      result.typed.forEach((name) => typed.add(name));
      markUntyped();
      if (visible) progress.finish(request.name, result.typed.includes(request.name) ? 'ready' : 'untyped');
    })
    .catch((error: unknown) => {
      // Offline, or the CDN is down: the package stays typed as `any` and
      // can be retried from the status bar, or on the next project open.
      started.delete(key);
      if (visible) progress.finish(request.name, 'failed');
      logger.warn(`Could not load types for ${request.name}`, error);
    });
  started.set(key, job);
}

/** Tries a package whose download failed again, as it was last requested. */
export function retryTypes(name: string): void {
  const request = lastRequest.get(name);
  if (!request) return;
  started.delete(requestKey(request));
  acquire(request);
}

/** Package type downloads for the open project, for the status bar. */
export function useTypeProgress(): TypeProgressSnapshot {
  return useSyncExternalStore(progress.subscribe, progress.getSnapshot, progress.getSnapshot);
}

/**
 * Keeps the editor's TypeScript service in step with the open project:
 * compiler options, the project's other files, and its packages' types,
 * which are fetched in the background and applied a package at a time.
 */
export function useTypeSupport(
  monaco: Monaco | null,
  project: EditorProject | null,
  model: editor.ITextModel | null,
): void {
  useEffect(() => {
    if (!monaco) return;
    const targets = languageDefaults(monaco);
    if (targets) registry.attach(targets);
  }, [monaco]);

  useEffect(() => {
    if (!monaco || !project) return;

    const requests = typeRequests(project);
    setWanted(requests.map((request) => request.name));

    registry.setProject(
      projectLibs(project.key, project.files, project.path),
      compilerOptions({ key: project.key, paths: project.paths, strict: project.strict }),
    );
    markUntyped();
    requests.forEach(acquire);
  }, [monaco, project]);

  useEffect(() => {
    if (!monaco || !project || !model || model.isDisposed()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const rescan = () => {
      if (model.isDisposed()) return;
      const fresh = liveRequests(model.getValue(), project)
        .filter((request) => !started.has(requestKey(request)));
      if (fresh.length === 0) return;
      setWanted([...new Set([...wanted, ...fresh.map((request) => request.name)])]);
      markUntyped();
      fresh.forEach(acquire);
    };

    const subscription = model.onDidChangeContent(() => {
      clearTimeout(timer);
      timer = setTimeout(rescan, RESCAN_DELAY_MS);
    });
    rescan();

    return () => {
      clearTimeout(timer);
      subscription.dispose();
    };
  }, [monaco, project, model]);
}
