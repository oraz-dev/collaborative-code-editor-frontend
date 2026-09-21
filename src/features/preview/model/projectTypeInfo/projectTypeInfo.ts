import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';
import { parseJsonWithComments, readPathAliases, resolvePathAlias } from '../pathAliases/pathAliases';
import { collectBareSpecifiers, readVersions, splitSpecifier } from '../resolvePackages/resolvePackages';

/**
 * What an editor's type checker needs to know about a project, read from the
 * same files and by the same rules the preview runs it with — so a package
 * the preview resolves is one the editor looks up types for, at the version
 * the preview loads.
 */
export interface ProjectPackage {
  name: string;
  /** The package.json range, '' when the project pins none. */
  range: string;
  /** Subpaths imported, e.g. `client` for `react-dom/client`. */
  subpaths: string[];
}

export interface ProjectTypeInfo {
  /** npm packages the project imports. */
  packages: ProjectPackage[];
  /** Import shortcuts in tsconfig `paths` form, relative to the project root. */
  paths: Record<string, string[]>;
  /** Whether the project's tsconfig asks for strict checking. */
  strict: boolean;
  /** Whether any file contains JSX, which needs React's JSX runtime types. */
  usesJsx: boolean;
}

const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const JSX_FILE = /\.[jt]sx$/i;
const TSCONFIG = /^(?:ts|js)config(?:\.[\w-]+)?\.json$/i;

export function projectTypeInfo(files: PreviewFile[]): ProjectTypeInfo {
  const scripts = files.filter((file) => SCRIPT.test(file.path));
  const aliases = readPathAliases(files);
  const versions = readVersions(files);

  const packages = new Map<string, ProjectPackage>();
  for (const specifier of collectBareSpecifiers(scripts.map((file) => file.content))) {
    // `@/hooks/useNow` looks like a package called `@`; it is the project's own file.
    if (resolvePathAlias(specifier, aliases) !== null) continue;
    const parts = splitSpecifier(specifier);
    if (!parts) continue;
    const entry = packages.get(parts.name)
      ?? { name: parts.name, range: versions[parts.name] ?? '', subpaths: [] };
    const subpath = parts.subpath.replace(/^\//, '');
    if (subpath && !entry.subpaths.includes(subpath)) entry.subpaths.push(subpath);
    packages.set(parts.name, entry);
  }

  const paths: Record<string, string[]> = {};
  for (const alias of aliases) {
    if (alias.wildcard) paths[`${alias.prefix}*`] = [`${alias.target}*`];
    else paths[alias.prefix] = [alias.target];
  }

  return {
    packages: [...packages.values()],
    paths,
    strict: readStrict(files),
    usesJsx: scripts.some((file) => JSX_FILE.test(file.path)),
  };
}

/** `compilerOptions.strict` from a root tsconfig; off when there is none. */
function readStrict(files: PreviewFile[]): boolean {
  for (const file of files) {
    if (!TSCONFIG.test(file.path)) continue;
    try {
      const config = parseJsonWithComments(file.content) as { compilerOptions?: { strict?: unknown } };
      if (config?.compilerOptions?.strict === true) return true;
    } catch {
      // A half-typed tsconfig is normal while editing it; it just says nothing.
    }
  }
  return false;
}
