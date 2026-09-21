import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';

/** Where npm packages come from. Serves every package as a browser ES module. */
export const PACKAGE_CDN = 'https://esm.sh';

/**
 * The same three statement shapes `rewriteImports` handles, but for bare
 * specifiers: anything not starting with `.` or `/`. Specifiers carrying a
 * scheme (`https:`, `workspace:`, `data:`) are filtered out afterwards.
 */
const BARE_IMPORT_PATTERNS: RegExp[] = [
  /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"./][^'"]*)['"]/g,
  /\bimport\s*\(?\s*['"]([^'"./][^'"]*)['"]/g,
];

/** `@scope/pkg` or `pkg`, then an optional `/sub/path`. */
const PACKAGE_SPECIFIER = /^((?:@[^/]+\/)?[^/]+)(\/.*)?$/;

/**
 * What npm accepts as a package name (uppercase tolerated, as old packages
 * have it). `@` alone, `~`, `#internal` are not packages: they are the
 * project's own aliases or subpath imports, and must never reach the CDN.
 */
const PACKAGE_NAME = /^(?:@[a-z0-9-][a-z0-9._~-]*\/)?[a-z0-9-][a-z0-9._~-]*$/i;

/**
 * Packages that must always be the same single copy.
 *
 * React keeps its hook state in a module-level singleton: a component
 * rendered by one copy of `react-dom` while calling hooks from another copy
 * throws "Invalid hook call". Pinning both to one version makes every package
 * that depends on React share the one the page imports.
 */
const SHARED_PEERS = ['react', 'react-dom'];

export interface ResolvedPackages {
  /** Import-map entries, specifier -> CDN URL. */
  imports: Record<string, string>;
  /** Package names in the order first seen, for display and tests. */
  packages: string[];
  /**
   * Bare specifiers that name no valid package — `@/x` with no alias for it,
   * `#internal` — and so were not sent to the CDN.
   */
  unresolved: string[];
}

export function isBareSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false;
  // `https://…`, `workspace:…`, `node:fs` — resolved elsewhere, or not at all.
  return !/^[a-z][a-z0-9+.-]*:/i.test(specifier);
}

/** Every bare specifier the sources import, deduplicated. */
export function collectBareSpecifiers(sources: string[]): string[] {
  const found = new Set<string>();

  for (const source of sources) {
    for (const pattern of BARE_IMPORT_PATTERNS) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (specifier && isBareSpecifier(specifier)) found.add(specifier);
      }
    }
  }

  return [...found];
}

export function splitSpecifier(specifier: string): { name: string; subpath: string } | null {
  const match = PACKAGE_SPECIFIER.exec(specifier);
  if (!match || !PACKAGE_NAME.test(match[1])) return null;
  return { name: match[1], subpath: match[2] ?? '' };
}

/**
 * Versions from a `package.json` in the workspace, if there is one.
 *
 * Read from `dependencies` and `devDependencies` alike: in a preview there is
 * no build step for the distinction to matter. A malformed file is ignored
 * rather than reported — the preview then runs on the latest versions, which
 * is what it would have done without the file.
 */
export function readVersions(files: PreviewFile[]): Record<string, string> {
  const manifest = files.find((file) => /(^|\/)package\.json$/i.test(file.path));
  if (!manifest) return {};

  try {
    const parsed: unknown = JSON.parse(manifest.content);
    if (!parsed || typeof parsed !== 'object') return {};

    const { dependencies, devDependencies } = parsed as Record<string, unknown>;
    const versions: Record<string, string> = {};

    for (const group of [devDependencies, dependencies]) {
      if (!group || typeof group !== 'object') continue;
      for (const [name, version] of Object.entries(group)) {
        if (typeof version === 'string') versions[name] = version;
      }
    }

    return versions;
  } catch {
    return {};
  }
}

/**
 * Maps every package the workspace imports onto esm.sh.
 *
 * This is what lets `import { useState } from 'react'` run with no bundler
 * and no install: the import map sends the bare name to a CDN URL, and the
 * browser fetches it as an ordinary ES module.
 *
 * Each seen specifier gets its own exact entry, plus a `name/` prefix entry
 * so a subpath only a *dependency* imports still resolves.
 */
export function resolvePackages(
  specifiers: string[],
  versions: Record<string, string> = {},
): ResolvedPackages {
  const packages: string[] = [];
  const unresolved: string[] = [];
  const subpaths = new Map<string, Set<string>>();

  for (const specifier of specifiers) {
    const parts = splitSpecifier(specifier);
    if (!parts) {
      if (!unresolved.includes(specifier)) unresolved.push(specifier);
      continue;
    }
    if (!subpaths.has(parts.name)) {
      packages.push(parts.name);
      subpaths.set(parts.name, new Set());
    }
    subpaths.get(parts.name)?.add(parts.subpath);
  }

  // One `react` for everyone: a package that brings its own React breaks
  // hooks, so any use of React pulls react-dom onto the same pinned version.
  const usesReact = packages.some((name) => SHARED_PEERS.includes(name));
  const pins = usesReact
    ? SHARED_PEERS.map((name) => `${name}@${versionOf(name, versions)}`)
    : [];

  const imports: Record<string, string> = {};

  for (const name of packages) {
    const base = `${PACKAGE_CDN}/${name}@${versionOf(name, versions)}`;
    // `react` itself takes no query: esm.sh builds a separate copy for any
    // `?deps=` variant, and every other package imports the plain one.
    const others = name === 'react' ? [] : pins.filter((pin) => !pin.startsWith(`${name}@`));
    const query = others.length > 0 ? `?deps=${others.join(',')}` : '';

    for (const subpath of subpaths.get(name) ?? []) {
      imports[`${name}${subpath}`] = `${base}${subpath}${query}`;
    }
    imports[`${name}/`] = `${base}/`;
  }

  return { imports, packages, unresolved };
}

/**
 * The version to ask the CDN for.
 *
 * A React major is pinned when none is given, so a package that happens to
 * resolve React through a peer range lands on the same copy as the page.
 */
function versionOf(name: string, versions: Record<string, string>): string {
  const declared = versions[name];
  if (declared) return encodeURIComponent(declared.trim());
  return SHARED_PEERS.includes(name) ? '19' : 'latest';
}
