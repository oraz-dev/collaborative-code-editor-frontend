/** Prefix for module specifiers the preview resolves through its import map. */
export const MODULE_SCHEME = 'workspace:';

/**
 * A workspace specifier: `.`, `..`, or either followed by a path — plus a
 * root-absolute `/path`, which Vite resolves from the project root (and then
 * `public/`), as in the template's `import viteLogo from '/vite.svg'`. Left
 * alone, `/vite.svg` would resolve against the module's `data:` URL and fail.
 * The bare dot forms are included because `import x from '..'` is how a file
 * reaches its parent folder's `index` module. `//host/x` is a URL, not a path.
 */
const RELATIVE = String.raw`(\.\.?(?:\/[^'"]*)?|\/(?!\/)[^'"]+)`;

/**
 * The forms that can carry a relative specifier. Each has the specifier in the
 * last capture group, so one replacer handles all of them.
 *
 * Deliberately narrow: this rewrites specifiers, it does not parse JavaScript.
 * A specifier inside a string literal or comment would be rewritten too, which
 * is a known and acceptable limit until there is a real bundler.
 */
const IMPORT_PATTERNS: RegExp[] = [
  // import x from './a.js'  |  export { y } from '../lib/b.js'
  new RegExp(String.raw`\b(?:import|export)\b[\s\S]*?\bfrom\s*['"]${RELATIVE}['"]`, 'g'),
  // import './a.js'  and  import('./a.js')
  new RegExp(String.raw`\bimport\s*\(?\s*['"]${RELATIVE}['"]`, 'g'),
];

/** `src/components/Card.js` -> `src/components`; a root-level file -> `''`. */
export function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/**
 * Resolves a relative specifier against the directory it was written in, or a
 * root-absolute one (`/src/a`) against the project root.
 *
 * `fromDirectory` is a workspace path with no leading or trailing slash — `''`
 * for the project root. A `..` that would climb above the root clamps there,
 * the way a server root does, rather than producing a path that names nothing:
 * the result is still a module that can be reported as missing by name.
 *
 * A trailing slash is dropped, so `./components/` and `./components` resolve to
 * the same key; the folder's `index` module is reached through an alias.
 */
export function normaliseSpecifier(specifier: string, fromDirectory = ''): string {
  // A `?query` or `#hash` (Vite's `?raw`, `?url`) is not part of the path: it
  // may itself hold a slash, and it must survive normalisation unchanged.
  const { path, query } = splitQuery(specifier);
  // A leading slash is the project root, wherever the import was written.
  const base = path.startsWith('/') ? '' : fromDirectory;
  const segments: string[] = base ? base.split('/') : [];

  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return segments.join('/') + query;
}

/**
 * `src/logo.svg?react` -> `{ path: 'src/logo.svg', query: '?react' }`.
 * The query keeps its `?` (or `#`), so `path + query` is the input again.
 */
export function splitQuery(specifier: string): { path: string; query: string } {
  const index = specifier.search(/[?#]/);
  return index === -1
    ? { path: specifier, query: '' }
    : { path: specifier.slice(0, index), query: specifier.slice(index) };
}

/**
 * Rewrites relative imports to `workspace:`-prefixed bare specifiers.
 *
 * A module served from a `data:` URL resolves `./util.js` against that URL,
 * which names nothing — and an import map cannot rescue it, because relative
 * specifiers are resolved *before* the map is consulted. Bare specifiers are
 * looked up in the map, so turning every relative path into one is what lets a
 * multi-file workspace run without a bundler.
 *
 * `fromPath` is the importing module's own workspace path. The preview passes
 * the path it is **published** under (`src/Card.js` for `src/Card.tsx`), since
 * that is what it has at the point of rewriting; only its directory is read,
 * and a module's directory never changes when it is transpiled, so the source
 * path gives the identical result.
 */
export function rewriteImports(source: string, fromPath: string): string {
  const fromDirectory = directoryOf(fromPath);
  let output = source;

  for (const pattern of IMPORT_PATTERNS) {
    output = output.replace(
      pattern,
      // Replacing the quoted specifier, not the bare one: `from '.'` would
      // otherwise have its first dot swapped wherever it appears earlier on.
      (statement, specifier: string) => statement.replace(
        new RegExp(`(['"])${escapeRegExp(specifier)}\\1$`),
        (_quoted, quote: string) => (
          `${quote}${MODULE_SCHEME}${normaliseSpecifier(specifier, fromDirectory)}${quote}`
        ),
      ),
    );
  }

  return output;
}

/**
 * Every relative specifier a module depends on, resolved against `fromPath`'s
 * directory (see `rewriteImports`) and deduplicated.
 */
export function collectDependencies(source: string, fromPath: string): string[] {
  const fromDirectory = directoryOf(fromPath);
  const found = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (specifier) found.add(normaliseSpecifier(specifier, fromDirectory));
    }
  }

  return [...found];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `https:`, `data:`, `//cdn.example` — addresses the workspace cannot hold. */
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * The workspace path a URL written in a file names, or null for one outside
 * the workspace (a scheme, `//host`, a bare `#fragment`).
 *
 * The way a dev server reads a URL in a page or a stylesheet: `/src/a.css` is
 * from the project root, `./a.css` and `a.css` from the file's own folder, and
 * a query or hash (`?v=2`) names the same file, so it is dropped.
 */
export function resolveWorkspaceUrl(url: string, fromPath: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || EXTERNAL_URL.test(trimmed)) return null;

  const bare = trimmed.replace(/[?#].*$/, '');
  if (!bare) return null;

  return bare.startsWith('/')
    ? normaliseSpecifier(bare, '')
    : normaliseSpecifier(bare, directoryOf(fromPath));
}
