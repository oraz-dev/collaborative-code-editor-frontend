/**
 * Type definitions for npm packages, fetched the way TypeScript's own
 * playground does it: straight from jsDelivr, which serves every published
 * version of every package as plain, immutable files.
 *
 * Only the declaration files a package's entry points actually reach are
 * fetched — `date-fns` publishes thousands of files, and the editor needs a
 * few hundred of them. Packages that ship no types of their own (React) fall
 * back to their DefinitelyTyped `@types/*` package, as `tsc` would.
 */

export const REGISTRY_API = 'https://data.jsdelivr.com/v1/packages/npm';
export const PACKAGE_CDN = 'https://cdn.jsdelivr.net/npm';

/** A declaration file, at the path TypeScript will look for it. */
export interface TypeFile {
  /** e.g. `node_modules/@types/react/index.d.ts` */
  path: string;
  content: string;
}

export interface TypeRequest {
  name: string;
  /** A version or range, as in package.json; '' for "whatever is current". */
  range: string;
  /** Subpaths imported as well as the package itself, e.g. `client` for `react-dom/client`. */
  subpaths?: string[];
}

export interface AcquiredTypes {
  files: TypeFile[];
  /** Requested packages that now have types. The rest have none to be found. */
  typed: string[];
}

export interface TypeFetcher {
  text: (url: string) => Promise<string>;
}

/**
 * How far an acquisition has got. `filesFound` only grows: declarations are
 * discovered by reading the ones before them, so the total is not known
 * until the walk ends — `done` says when it has.
 */
export interface AcquireProgress {
  /** The package that supplies the types, e.g. `@types/react` for `react`. */
  source: string | null;
  version: string | null;
  filesDone: number;
  filesFound: number;
}

export interface AcquireOptions {
  signal?: AbortSignal;
  onProgress?: (progress: AcquireProgress) => void;
}

const DECLARATION = /\.d\.[cm]?ts$/;
/** A bound per package, far above any real package's reachable declarations. */
const MAX_FILES_PER_PACKAGE = 1500;
/** Requests in flight at once, across every package. */
const CONCURRENCY = 16;

/** `react` -> `@types/react`, `@scope/pkg` -> `@types/scope__pkg`. */
export function typesPackageName(name: string): string {
  return name.startsWith('@') ? `@types/${name.slice(1).replace('/', '__')}` : `@types/${name}`;
}

/** The version to ask for when the project pins none: the preview's React, or the latest. */
export function defaultRange(name: string): string {
  return name === 'react' || name === 'react-dom' ? '19' : 'latest';
}

/**
 * Strips comments, keeping string literals intact. Declaration files are full
 * of JSDoc examples (`import { format } from 'date-fns'`) that must not be
 * mistaken for imports.
 */
export function stripComments(source: string): string {
  let output = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"' || char === "'" || char === '`') {
      let end = index + 1;
      while (end < source.length && source[end] !== char) end += source[end] === '\\' ? 2 : 1;
      output += source.slice(index, end + 1);
      index = end + 1;
    } else if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
    } else {
      output += char;
      index += 1;
    }
  }

  return output;
}

const IMPORT_PATTERNS: RegExp[] = [
  // import x from 'a' | export * from 'a' | export { x } from 'a' — across lines
  /(?:^|[^.\w$])(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  // import 'a'
  /(?:^|[^.\w$])import\s*['"]([^'"]+)['"]/g,
  // import('a') inside a type, and `import x = require('a')`
  /(?:^|[^.\w$])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Every module a declaration file refers to, `/// <reference>`s included. */
export function scanImports(source: string): string[] {
  const found = new Set<string>();

  // References live in comments, so they are read before comments are stripped.
  for (const [, path] of source.matchAll(/\/\/\/\s*<reference\s+path\s*=\s*['"]([^'"]+)['"]/g)) {
    found.add(path.startsWith('.') ? path : `./${path}`);
  }
  for (const [, types] of source.matchAll(/\/\/\/\s*<reference\s+types\s*=\s*['"]([^'"]+)['"]/g)) {
    found.add(types);
  }

  const code = stripComments(source);
  for (const pattern of IMPORT_PATTERNS) {
    for (const [, specifier] of code.matchAll(pattern)) found.add(specifier);
  }

  return [...found];
}

function normalise(path: string): string {
  const segments: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/');
}

function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** The declaration file a relative import inside a package lands on, if it has one. */
export function resolveDeclaration(from: string, specifier: string, files: Set<string>): string | null {
  const base = normalise(`${dirname(from)}/${specifier}`);
  const candidates = DECLARATION.test(base)
    ? [base]
    : [
      base.replace(/\.m?jsx?$/, '.d.ts'),
      // Declarations may name their siblings by source extension: `./add.ts`.
      base.replace(/\.([cm]?)tsx?$/, '.d.$1ts'),
      base.replace(/\.mjs$/, '.d.mts'),
      base.replace(/\.cjs$/, '.d.cts'),
      `${base}.d.ts`,
      `${base}.d.mts`,
      `${base}/index.d.ts`,
      `${base}/index.d.mts`,
    ];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

type ExportsValue = string | null | ExportsValue[] | { [condition: string]: ExportsValue };

interface PackageManifest {
  name?: string;
  types?: string;
  typings?: string;
  main?: string;
  exports?: ExportsValue;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Declaration paths under one `exports` entry, skipping CommonJS-only and old-TS branches. */
function declarationLeaves(value: ExportsValue, star: string, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value.replace('*', star));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => declarationLeaves(item, star, out));
    return;
  }
  if (!value) return;
  for (const [condition, nested] of Object.entries(value)) {
    // `types@<=5.0` points at copies for old compilers; `require` at CJS twins.
    if (condition.startsWith('types@') || condition === 'require') continue;
    declarationLeaves(nested, star, out);
  }
}

/** The declaration files a package (or one of its subpaths) starts from. */
export function entryDeclarations(manifest: PackageManifest, subpath: string, files: Set<string>): string[] {
  const key = subpath ? `./${subpath}` : '.';
  const leaves: string[] = [];
  const { exports } = manifest;

  if (exports && typeof exports === 'object' && !Array.isArray(exports)) {
    const keys = Object.keys(exports);
    const isConditionMap = keys.length > 0 && keys.every((name) => !name.startsWith('.'));
    if (isConditionMap) {
      if (!subpath) declarationLeaves(exports, '', leaves);
    } else if (key in exports) {
      declarationLeaves(exports[key], '', leaves);
    } else {
      for (const pattern of keys) {
        const star = pattern.indexOf('*');
        if (star === -1) continue;
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (key.startsWith(prefix) && key.endsWith(suffix) && key.length >= prefix.length + suffix.length) {
          declarationLeaves(exports[pattern], key.slice(prefix.length, key.length - suffix.length), leaves);
        }
      }
    }
  } else if (typeof exports === 'string' && !subpath) {
    leaves.push(exports);
  }

  if (!subpath) {
    for (const field of [manifest.types, manifest.typings, manifest.main]) if (field) leaves.push(field);
    leaves.push('index.d.ts');
  } else {
    leaves.push(`${subpath}.d.ts`, `${subpath}/index.d.ts`);
  }

  const resolved = new Set<string>();
  for (const leaf of leaves) {
    const hit = resolveDeclaration('', leaf.startsWith('.') ? leaf : `./${leaf}`, files);
    if (hit) resolved.add(hit);
  }
  return [...resolved];
}

function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split('/');
  const size = specifier.startsWith('@') ? 2 : 1;
  return { name: parts.slice(0, size).join('/'), subpath: parts.slice(size).join('/') };
}

/** Caps concurrent requests, so a large package does not queue the editor's own. */
function limiter(size: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= size) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

interface PackageState {
  /** The directory name under node_modules — `@types/react` for react's types. */
  directory: string;
  manifest: PackageManifest;
  files: Set<string>;
  version: string;
  walked: Set<string>;
}

/**
 * Fetches types for every requested package and everything their
 * declarations import, one version per package name (as node_modules is).
 *
 * Never rejects for a single package: one that cannot be found, or has no
 * types anywhere, is simply absent from `typed`.
 */
export async function acquireTypes(
  requests: TypeRequest[],
  fetcher: TypeFetcher,
  options: AcquireOptions = {},
): Promise<AcquiredTypes> {
  const { signal, onProgress } = options;
  const run = limiter(CONCURRENCY);
  const progress: AcquireProgress = { source: null, version: null, filesDone: 0, filesFound: 0 };
  const report = () => onProgress?.({ ...progress });
  const primary = new Set(requests.map((request) => request.name));
  const output = new Map<string, string>();
  const packages = new Map<string, Promise<PackageState | null>>();
  const pinned = new Map(requests.map((request) => [request.name, request.range]));

  const text = (url: string) => {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return run(() => fetcher.text(url));
  };
  const json = async <T>(url: string): Promise<T> => JSON.parse(await text(url)) as T;

  async function locate(name: string, range: string): Promise<PackageState | null> {
    const resolved = await json<{ version?: string | null }>(
      `${REGISTRY_API}/${name}/resolved?specifier=${encodeURIComponent(range || defaultRange(name))}`,
    );
    if (!resolved.version) return null;

    const listing = await json<{ files?: { name: string }[] }>(
      `${REGISTRY_API}/${name}@${resolved.version}?structure=flat`,
    );
    const files = new Set((listing.files ?? []).map((file) => file.name.replace(/^\//, '')));
    const manifest = await json<PackageManifest>(`${PACKAGE_CDN}/${name}@${resolved.version}/package.json`);

    return { directory: name, manifest, files, version: resolved.version, walked: new Set() };
  }

  /** A package's own types, else its `@types` twin; null when neither exists. */
  function packageState(name: string, range: string): Promise<PackageState | null> {
    let state = packages.get(name);
    if (!state) {
      state = (async () => {
        try {
          const chosen = await chooseTypes(name, range);
          if (chosen && primary.has(name) && !progress.source) {
            progress.source = chosen.directory;
            progress.version = chosen.version;
            report();
          }
          // Only the package that supplies the types gets a manifest: react's
          // own, which has none, would otherwise stand in front of @types/react.
          if (chosen) output.set(`node_modules/${chosen.directory}/package.json`, JSON.stringify(chosen.manifest));
          return chosen;
        } catch (error) {
          if (signal?.aborted) throw error;
          return null;
        }
      })();
      packages.set(name, state);
    }
    return state;
  }

  async function chooseTypes(name: string, range: string): Promise<PackageState | null> {
    const own = await locate(name, range);
    if (own && [...own.files].some((file) => DECLARATION.test(file))) return own;
    if (name.startsWith('@types/')) return null;
    // `@types/react@19` tracks react 19; a range that is not a version falls to the latest.
    const typesRange = /^[\^~]?\d/.test(range) ? range : '';
    const types = await locate(typesPackageName(name), typesRange).catch(() => null);
    if (types || !typesRange) return types;
    return locate(typesPackageName(name), '').catch(() => null);
  }

  async function walk(state: PackageState, entries: string[], ranges: Record<string, string>): Promise<void> {
    const queue = entries.filter((entry) => !state.walked.has(entry));
    queue.forEach((entry) => state.walked.add(entry));
    progress.filesFound += queue.length;
    report();
    const pending: Promise<unknown>[] = [];

    while (queue.length > 0) {
      const batch = queue.splice(0, queue.length);
      const sources = await Promise.all(batch.map((file) =>
        text(`${PACKAGE_CDN}/${state.directory}@${state.version}/${file}`)
          .catch(() => null)
          .finally(() => {
            progress.filesDone += 1;
            report();
          })));
      if (signal?.aborted) return;

      batch.forEach((file, index) => {
        const source = sources[index];
        if (source === null) return;
        output.set(`node_modules/${state.directory}/${file}`, source);

        for (const specifier of scanImports(source)) {
          if (specifier.startsWith('.')) {
            const target = resolveDeclaration(file, specifier, state.files);
            if (target && !state.walked.has(target) && state.walked.size < MAX_FILES_PER_PACKAGE) {
              state.walked.add(target);
              queue.push(target);
              progress.filesFound += 1;
            }
            continue;
          }
          pending.push(acquire(specifier, ranges));
        }
      });
    }

    await Promise.all(pending);
  }

  /** Types for a bare specifier met anywhere: the project's, or a declaration's. */
  async function acquire(specifier: string, ranges: Record<string, string>): Promise<boolean> {
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return false; // node:fs and friends
    const { name, subpath } = splitSpecifier(specifier);
    // A package importing its own types (`@types/react` -> `react`) is not a new package.
    const range = pinned.get(name) ?? ranges[name] ?? ranges[typesPackageName(name)] ?? '';
    const state = await packageState(name, range);
    if (!state) return false;

    const entries = entryDeclarations(state.manifest, subpath, state.files);
    if (entries.length === 0) return false;
    await walk(state, entries, { ...state.manifest.peerDependencies, ...state.manifest.dependencies });
    return true;
  }

  const results = await Promise.all(requests.map(async (request) => {
    const subpaths = ['', ...(request.subpaths ?? [])];
    const outcomes = await Promise.all(subpaths.map((subpath) =>
      acquire(subpath ? `${request.name}/${subpath}` : request.name, {})));
    return outcomes[0] ? request.name : null;
  }));

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return {
    files: [...output].map(([path, content]) => ({ path, content })),
    typed: results.filter((name): name is string => name !== null),
  };
}
