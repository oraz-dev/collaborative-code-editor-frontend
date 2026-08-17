/** Prefix for module specifiers the preview resolves through its import map. */
export const MODULE_SCHEME = 'workspace:';

/**
 * The three forms that can carry a relative specifier. Each has the specifier
 * in the last capture group, so one replacer handles all of them.
 *
 * Deliberately narrow: this rewrites specifiers, it does not parse JavaScript.
 * A specifier inside a string literal or comment would be rewritten too, which
 * is a known and acceptable limit until there is a real bundler.
 */
const IMPORT_PATTERNS: RegExp[] = [
  // import x from './a.js'  |  export { y } from '../lib/b.js'
  /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"](\.\.?\/[^'"]*)['"]/g,
  // import './a.js'  and  import('./a.js')
  /\bimport\s*\(?\s*['"](\.\.?\/[^'"]*)['"]/g,
];

/** `./a.js`, `../lib/b.js` -> `a.js`, `lib/b.js` */
export function normaliseSpecifier(specifier: string): string {
  const segments: string[] = [];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return segments.join('/');
}

/**
 * Rewrites relative imports to `workspace:`-prefixed bare specifiers.
 *
 * A module served from a `blob:` URL resolves `./util.js` against that blob's
 * own address, which does not exist — and an import map cannot rescue it,
 * because relative specifiers are resolved *before* the map is consulted. Bare
 * specifiers are looked up in the map, so turning every relative path into one
 * is what lets a multi-file workspace run without a bundler.
 */
export function rewriteImports(source: string): string {
  let output = source;

  for (const pattern of IMPORT_PATTERNS) {
    output = output.replace(
      pattern,
      (statement, specifier: string) => statement.replace(
        specifier,
        `${MODULE_SCHEME}${normaliseSpecifier(specifier)}`,
      ),
    );
  }

  return output;
}

/** Every relative specifier a module depends on, normalised and deduplicated. */
export function collectDependencies(source: string): string[] {
  const found = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (specifier) found.add(normaliseSpecifier(specifier));
    }
  }

  return [...found];
}
