import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';
import { normaliseSpecifier } from '../rewriteImports/rewriteImports';

/**
 * Path aliases such as `@/components/Button`, resolved the way the project's
 * own tooling would.
 *
 * To a browser, `@/components/Button` is a bare specifier: a package named `@`.
 * Left alone it would be sent to the CDN, fail there, and leak the project's
 * module layout to a third party. Each alias is turned into a root-absolute
 * workspace path (`/src/components/Button`) before imports are rewritten, so it
 * resolves exactly like a relative import of the same file.
 */
export interface PathAlias {
  /** `@/` for `"@/*"`, or the whole specifier for an exact alias such as `"utils"`. */
  prefix: string;
  /** Whether `prefix` is followed by a rest (`@/*`) rather than naming one module. */
  wildcard: boolean;
  /** The workspace path the match maps onto: `src/` for `"./src/*"`. */
  target: string;
}

/** `tsconfig.json`, `tsconfig.app.json`, `jsconfig.json` — at the project root only. */
const CONFIG_FILE = /^(?:ts|js)config(?:\.[\w-]+)?\.json$/i;

/**
 * Used when the project declares no `paths`: the alias nearly every Vite and
 * Next template sets up, and the one this repository uses. Only applied when
 * the project actually has a `src/` folder to point at.
 */
const DEFAULT_ALIASES: PathAlias[] = [
  { prefix: '@/', wildcard: true, target: 'src/' },
  { prefix: '~/', wildcard: true, target: 'src/' },
];

/**
 * tsconfig is JSON with comments and trailing commas. Strips both, leaving
 * strings (which may contain `//`, as in a URL) untouched.
 */
export function parseJsonWithComments(text: string): unknown {
  let output = '';
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      output += text.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }

    output += char;
    index += 1;
  }

  return JSON.parse(output.replace(/,(\s*[}\]])/g, '$1'));
}

function aliasesFromConfig(content: string): PathAlias[] {
  let config: unknown;
  try {
    config = parseJsonWithComments(content);
  } catch {
    // A config the preview cannot read is no worse than no config.
    return [];
  }

  const options = (config as { compilerOptions?: unknown } | null)?.compilerOptions;
  if (!options || typeof options !== 'object') return [];

  const { baseUrl, paths } = options as { baseUrl?: unknown; paths?: unknown };
  if (!paths || typeof paths !== 'object') return [];

  // Relative to the config file, which is at the root.
  const base = typeof baseUrl === 'string' ? normaliseSpecifier(baseUrl, '') : '';
  const aliases: PathAlias[] = [];

  for (const [pattern, targets] of Object.entries(paths as Record<string, unknown>)) {
    const first = Array.isArray(targets) ? targets.find((item) => typeof item === 'string') : undefined;
    // `"*"` would claim every npm package as a workspace file.
    if (typeof first !== 'string' || pattern === '*' || pattern === '') continue;

    const wildcard = pattern.endsWith('*');
    const resolved = normaliseSpecifier(wildcard ? first.replace(/\*$/, '') : first, base);
    aliases.push({
      prefix: wildcard ? pattern.slice(0, -1) : pattern,
      wildcard,
      target: wildcard && resolved ? `${resolved}/` : resolved,
    });
  }

  return aliases;
}

/**
 * The project's path aliases: every `compilerOptions.paths` entry in its root
 * tsconfig/jsconfig files, or the conventional `@/` and `~/` -> `src/` when it
 * declares none.
 */
export function readPathAliases(files: PreviewFile[]): PathAlias[] {
  const configured = files
    .filter((file) => !file.path.includes('/') && CONFIG_FILE.test(file.path))
    .flatMap((file) => aliasesFromConfig(file.content));
  if (configured.length > 0) return configured;

  const hasSrc = files.some((file) => file.path.startsWith('src/'));
  return hasSrc ? DEFAULT_ALIASES : [];
}

/**
 * The root-absolute workspace specifier an aliased import stands for, or null
 * when no alias matches. The longest matching prefix wins, as in TypeScript.
 */
export function resolvePathAlias(specifier: string, aliases: PathAlias[]): string | null {
  let best: { alias: PathAlias; rest: string } | null = null;

  for (const alias of aliases) {
    const matches = alias.wildcard ? specifier.startsWith(alias.prefix) : specifier === alias.prefix;
    if (!matches) continue;
    if (best && best.alias.prefix.length >= alias.prefix.length) continue;
    best = { alias, rest: alias.wildcard ? specifier.slice(alias.prefix.length) : '' };
  }

  return best ? `/${best.alias.target}${best.rest}` : null;
}

/* The same statement shapes `rewriteImports` reads, for any quoted specifier. */
const SPECIFIER_PATTERNS: RegExp[] = [
  /\b(?:import|export)\b[\s\S]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*\(?\s*(['"])([^'"\n]+)\1/g,
];

/**
 * Rewrites every aliased import in `source` to the root-absolute path it
 * stands for, so the ordinary relative-import rewrite takes it from there.
 */
export function applyPathAliases(source: string, aliases: PathAlias[]): string {
  if (aliases.length === 0) return source;

  let output = source;
  for (const pattern of SPECIFIER_PATTERNS) {
    output = output.replace(pattern, (statement, quote: string, specifier: string) => {
      const resolved = resolvePathAlias(specifier, aliases);
      if (resolved === null) return statement;
      const quoted = `${quote}${specifier}${quote}`;
      return statement.slice(0, statement.length - quoted.length) + `${quote}${resolved}${quote}`;
    });
  }
  return output;
}
