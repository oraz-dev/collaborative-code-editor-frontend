import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';
import { resolveWorkspaceUrl } from '../rewriteImports/rewriteImports';
import { lookupIn, resolveCssReferences } from '../cssReferences/cssReferences';

/**
 * Reading an HTML entry the way a dev server would serve it.
 *
 * A Vite project's `index.html` names its code by URL —
 * `<script type="module" src="/src/main.tsx">`, `<link rel="stylesheet"
 * href="./style.css">` — and a server answers those URLs. The preview frame
 * has no server (it is an opaque-origin `srcdoc`), so each such tag is
 * resolved here, at build time, to the workspace file it names.
 *
 * Tag-level pattern matching, not an HTML parser: attributes are read the way
 * the HTML tokenizer reads them, but a `>` inside a quoted attribute value
 * would end a tag early. Real entry pages do not do that.
 */

/** A module the page runs, in document order. */
export type PageModule =
  /** `<script type="module" src>`: a workspace path, as written in the source tree. */
  | { kind: 'src'; path: string }
  /** `<script type="module">…</script>`: the body, still to be resolved. */
  | { kind: 'inline'; source: string };

/** An import map's two parts, as the page wrote them. */
export interface ImportMap {
  imports: Record<string, string>;
  scopes: Record<string, Record<string, string>>;
}

export interface PageTransform {
  /**
   * The page with its stylesheets inlined, and each module script replaced
   * by `modulePlaceholder(index)` — for the builder to put a script that runs
   * that module back in the same place.
   */
  html: string;
  modules: PageModule[];
  /** Workspace stylesheets a `<link>` put on the page, in order. */
  linkedStyles: string[];
  /**
   * The page's own `<script type="importmap">`, merged, when it has module
   * scripts to run: those tags are taken out, since the loader's map must be
   * the only one and carries these entries instead. Null when there is none.
   */
  importMap: ImportMap | null;
  /** What a linked stylesheet references but cannot load, for the console. */
  warnings: string[];
}

/**
 * Stands in for the page's module script number `index` in `html`. Private-use
 * characters no real page contains, so the builder can never replace anything else.
 */
export function modulePlaceholder(index: number): string {
  return `\uE000space-module-${index}\uE001`;
}

const IMPORT_MAP_PLACEHOLDER = /\uE000space-importmap-(\d+)\uE001/g;

/*
 * Comments first, so a commented-out tag is skipped as a unit; then script
 * elements whole, so a `<link` written inside a script's text is never taken
 * for a tag; then link tags.
 */
const TAGS = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<link\b([^>]*)>/gi;

/** `name`, `name=value`, `name="value"` or `name='value'`. */
const ATTRIBUTE = /([^\s"'=<>/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributesOf(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name, double, single, bare] of source.matchAll(ATTRIBUTE)) {
    const key = name.toLowerCase();
    // As in HTML, the first of a repeated attribute wins.
    if (!attributes.has(key)) attributes.set(key, double ?? single ?? bare ?? '');
  }
  return attributes;
}

/**
 * The workspace path a URL in the page names, or null for one outside it.
 *
 * `/src/main.tsx` is from the project root — what a dev server roots its URLs
 * at — while `./main.tsx` and `main.tsx` are from the page's own folder. A
 * query or hash (`?v=2`) names the same file to a server, so it is dropped.
 */
export function resolvePageUrl(url: string, pagePath: string): string | null {
  return resolveWorkspaceUrl(url, pagePath);
}

function isModuleScript(attributes: Map<string, string>): boolean {
  return attributes.get('type')?.trim().toLowerCase() === 'module';
}

/**
 * Whether the page loads a module from the workspace by `src` — the mark of a
 * Vite (or any bundler-style) `index.html` that is the app's real entry, as
 * opposed to a static page that happens to be called index.
 *
 * The `src` must name a workspace path (a CDN URL is not the app's own code)
 * and, when `files` is given, one that exists.
 */
export function hasModuleScript(html: string, pagePath = 'index.html', files?: PreviewFile[]): boolean {
  const known = files ? new Set(files.map((file) => file.path)) : null;

  for (const [match, scriptAttributes] of html.matchAll(TAGS)) {
    if (match.startsWith('<!--') || scriptAttributes === undefined) continue;
    const attributes = attributesOf(scriptAttributes);
    const src = attributes.get('src');
    if (!isModuleScript(attributes) || src === undefined) continue;

    const path = resolvePageUrl(src, pagePath);
    if (path !== null && (known === null || known.has(path))) return true;
  }
  return false;
}

/** Folds one `<script type="importmap">` body into `into`; earlier entries win, as browsers merge them. */
function mergeImportMap(into: ImportMap, body: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // The browser would reject it too; there is nothing to carry over.
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;

  const { imports, scopes } = parsed as { imports?: unknown; scopes?: unknown };
  if (imports && typeof imports === 'object') {
    for (const [key, value] of Object.entries(imports)) {
      if (typeof value === 'string' && !(key in into.imports)) into.imports[key] = value;
    }
  }
  if (scopes && typeof scopes === 'object') {
    for (const [scope, entries] of Object.entries(scopes)) {
      if (!entries || typeof entries !== 'object') continue;
      const target = into.scopes[scope] ?? {};
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value === 'string' && !(key in target)) target[key] = value;
      }
      into.scopes[scope] = target;
    }
  }
}

export function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** `</style` in a stylesheet must not close the tag it is inlined into. */
export function escapeForStyleTag(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

function isStylesheetLink(attributes: Map<string, string>): boolean {
  const rel = attributes.get('rel') ?? '';
  return rel.toLowerCase().split(/\s+/).includes('stylesheet');
}

/**
 * Takes the page's module scripts out, for the module loader to run, and puts
 * its workspace stylesheets in.
 *
 * Every `<script type="module">` is replaced — with a `src` inside the
 * workspace, or inline — because it could not run as written: a `src` has no
 * server to fetch from, and an inline body's `import './x'` resolves against
 * `about:srcdoc`. The builder puts a module script back in its place that
 * imports the resolved module, so it still runs natively: in document order,
 * before `DOMContentLoaded`. A module script from an external URL, and every
 * classic `<script>`, are left alone.
 *
 * A `<link rel="stylesheet">` naming a workspace `.css` file becomes a
 * `<style>` in the same place, so the cascade order the page wrote is kept,
 * with its own `@import`s and SVG `url()`s resolved.
 */
export function transformPage(html: string, pagePath: string, files: PreviewFile[]): PageTransform {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const lookup = lookupIn(files);
  const modules: PageModule[] = [];
  const linkedStyles: string[] = [];
  const warnings: string[] = [];
  const importMapTags: string[] = [];
  const importMap: ImportMap = { imports: {}, scopes: {} };

  const replaced = html.replace(
    TAGS,
    (match, scriptAttributes: string | undefined, body: string | undefined, linkAttributes: string | undefined) => {
      if (match.startsWith('<!--')) return match;

      if (scriptAttributes !== undefined) {
        const attributes = attributesOf(scriptAttributes);

        if (attributes.get('type')?.trim().toLowerCase() === 'importmap') {
          mergeImportMap(importMap, body ?? '');
          importMapTags.push(match);
          return `\uE000space-importmap-${importMapTags.length - 1}\uE001`;
        }

        if (!isModuleScript(attributes)) return match;

        const src = attributes.get('src');
        if (src === undefined) {
          modules.push({ kind: 'inline', source: body ?? '' });
          return modulePlaceholder(modules.length - 1);
        }

        const path = resolvePageUrl(src, pagePath);
        if (path === null) return match;
        modules.push({ kind: 'src', path });
        return modulePlaceholder(modules.length - 1);
      }

      const attributes = attributesOf(linkAttributes ?? '');
      if (!isStylesheetLink(attributes)) return match;

      const path = resolvePageUrl(attributes.get('href') ?? '', pagePath);
      const file = path === null ? undefined : byPath.get(path);
      if (!file || !/\.css$/i.test(file.path)) return match;

      linkedStyles.push(file.path);
      const resolved = resolveCssReferences(file.content, file.path, lookup);
      warnings.push(...resolved.warnings);
      return `<style data-path="${escapeAttribute(file.path)}">\n${escapeForStyleTag(resolved.css)}\n</style>`;
    },
  );

  // With no module to run there is no loader, and the page's map is its own.
  const keepMaps = modules.length === 0;
  const output = replaced.replace(IMPORT_MAP_PLACEHOLDER, (_match, index: string) => (
    keepMaps ? importMapTags[Number(index)] : ''
  ));

  return {
    html: output,
    modules,
    linkedStyles,
    importMap: keepMaps || importMapTags.length === 0 ? null : importMap,
    warnings,
  };
}
