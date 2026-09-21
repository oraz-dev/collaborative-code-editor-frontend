import {
  collectBareSpecifiers,
  readVersions,
  resolvePackages,
} from '../resolvePackages/resolvePackages';
import {
  assetQueryOf,
  buildAssetModule,
  buildQueryAssetModule,
  isStylesheet,
  missingAssetModule,
} from '../assetModules/assetModules';
import {
  collectDependencies,
  directoryOf,
  rewriteImports,
  splitQuery,
} from '../rewriteImports/rewriteImports';
import { publishedPath } from '../transpile/transpile';
import {
  escapeAttribute,
  escapeForStyleTag,
  modulePlaceholder,
  transformPage,
  type ImportMap,
} from '../htmlPage/htmlPage';
import { shimImportMeta } from '../viteShim/viteShim';
import { applyPathAliases, readPathAliases } from '../pathAliases/pathAliases';
import { lookupIn, resolveCssReferences, type FileLookup } from '../cssReferences/cssReferences';
import { CONSOLE_BRIDGE, MODULE_LOADER } from './runtime';

export interface PreviewFile {
  /**
   * Path relative to the project root folder, without that folder's own name:
   * `src/components/Button.tsx`, or just `App.tsx` for a file at the top.
   */
  path: string;
  content: string;
}

export interface PreviewInput {
  files: PreviewFile[];
  /** Path of the module or page to run. */
  entry: string;
}

const RUNNABLE_SCRIPT = /\.(mjs|cjs|js|jsx|ts|tsx)$/i;
const RUNNABLE_PAGE = /\.html?$/i;
const STYLE = /\.css$/i;
const COMPONENT_SOURCE = /\.(jsx|tsx)$/i;
/** Any sign the entry mounts itself, in which case it must not be mounted twice. */
const MOUNTS_ITSELF = /\b(?:createRoot|hydrateRoot|render)\s*\(/;

export function isRunnable(fileName: string): boolean {
  return RUNNABLE_SCRIPT.test(fileName) || RUNNABLE_PAGE.test(fileName);
}

/** Why a file cannot be previewed, or null when it can. */
export function whyNotRunnable(fileName: string): string | null {
  if (isRunnable(fileName)) return null;
  if (STYLE.test(fileName)) {
    return 'A stylesheet is applied by the page that links it — open an .html file to preview.';
  }
  return 'Only .js, .ts and .html files can run in the preview right now.';
}

/**
 * Serialised data for a `<script>` island. Every `<` becomes `\u003c` — still
 * the same JSON — so no text in it can close the element (`</script`) or move
 * the HTML tokenizer into a comment-like escaped state (`<!--` followed by
 * `<script`), where the island's own `</script>` would stop closing it and
 * swallow the rest of the document, loader included.
 */
function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Stylesheets inlined into the page: those in the entry's own folder only.
 *
 * With the whole project loaded, inlining every `.css` would put an unrelated
 * folder's rules on the page — a second demo's `body { … }` restyling this
 * one. The entry's folder is exactly what the preview used to see when it
 * loaded siblings alone.
 *
 * For a module entry this is only the fallback for code that imports no
 * stylesheet at all: as soon as a module the entry reaches does, imports
 * decide (see `buildPreviewDocument`). An HTML page gets it when it links no
 * workspace stylesheet and its modules import none.
 *
 * Escaped like a linked stylesheet, so a `</style>` in the CSS or a quote in
 * a file name cannot break out of the tag; and resolved like one, so its
 * `@import`s and SVG `url()`s load.
 */
function styleTags(files: PreviewFile[], entry: string, lookup: FileLookup, warnings: string[]): string {
  const folder = directoryOf(entry);
  return files
    .filter((file) => STYLE.test(file.path) && directoryOf(file.path) === folder)
    .map((file) => {
      const resolved = resolveCssReferences(file.content, file.path, lookup);
      warnings.push(...resolved.warnings);
      return `<style data-path="${escapeAttribute(file.path)}">\n${escapeForStyleTag(resolved.css)}\n</style>`;
    })
    .join('\n');
}

/** A classic script that puts build-time warnings in the preview console. */
function warningScript(warnings: string[]): string {
  if (warnings.length === 0) return '';
  const lines = warnings.map((warning) => `console.warn(${escapeJsonForScript(warning)});`);
  return `<script>${lines.join('\n')}</script>`;
}

/**
 * Neutral defaults, so a blank page is not a white flash inside a dark editor.
 *
 * The page paints its own `Canvas` background. Without it the frame element's
 * white shows through, while text follows the dark scheme and turns near-white
 * — so an unstyled React app renders, and nobody can see it.
 */
const BASE_STYLE = `<style>
  html { color-scheme: light dark; background: Canvas; color: CanvasText; }
  body { margin: 0; padding: 16px; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
</style>`;

/**
 * Assembles the complete HTML document handed to the preview frame.
 *
 * Everything is inlined because the frame is given an opaque origin — no
 * `allow-same-origin` — so it cannot fetch a `blob:` or same-site URL created
 * out here. That restriction is the whole point: it is also what stops
 * previewed code reading the editor's cookies, storage or DOM.
 */
export function buildPreviewDocument(input: PreviewInput): string {
  const { files, entry } = input;

  if (RUNNABLE_PAGE.test(entry)) {
    const page = files.find((file) => file.path === entry);
    return buildPageDocument(page?.content ?? '', files, entry);
  }

  // A TS entry is published as .js by the transpile step — unless another
  // source already owns that name (see `publishedPath`).
  const entryPath = publishedPath(entry, new Set(files.map((file) => file.path)));
  const entrySource = files.find((file) => file.path === entryPath)?.content ?? '';
  const mount = shouldMountDefault(entry, entrySource);

  const workspace = buildWorkspace(files, {
    // The entry must exist even when empty, or the loader imports `undefined`.
    ensure: entryPath,
    entries: [entryPath],
    extraSpecifiers: mount ? ['react', 'react-dom/client'] : [],
  });

  const warnings: string[] = [];
  // Once a module the entry reaches imports a stylesheet, the imports decide
  // what is on the page; inlining the entry folder's CSS as well would apply
  // it twice, or apply one the code deliberately does not import.
  const styles = workspace.importsStyles ? '' : styleTags(files, entry, lookupIn(files), warnings);

  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    BASE_STYLE,
    styles,
    '</head><body>',
    '<div id="root"></div>',
    `<script>${CONSOLE_BRIDGE}</script>`,
    warningScript(warnings),
    ...loaderTags(workspace, [entryPath], { mount }),
    '</body></html>',
  ].filter(Boolean).join('\n');
}

/** Everything the module loader needs, resolved at build time. */
interface Workspace {
  /** Published path -> module source, workspace and generated asset modules alike. */
  modules: Record<string, string>;
  aliases: Record<string, string>;
  /** Import-map entries for npm packages (and a page's own import map). */
  packages: Record<string, string>;
  /** A page's own import-map scopes, carried over; empty otherwise. */
  scopes: ImportMap['scopes'];
  /**
   * Whether a module reachable from the entries imports a stylesheet, which
   * switches auto-inlining off. Reachable only: an unrelated folder of the
   * same project importing CSS says nothing about how this entry is styled.
   */
  importsStyles: boolean;
}

interface WorkspaceOptions {
  /** A module path that must exist, as an empty module if no file has it. */
  ensure?: string;
  /** Published paths the run starts from, for what they reach. */
  entries: string[];
  /**
   * Modules that are not files — a page's inline `<script type="module">`
   * bodies — keyed by the path they are resolved from. Kept out of the
   * aliases: nothing imports them, and their synthetic names must never
   * claim a spelling a real file should have.
   */
  extraModules?: Record<string, string>;
  /** Packages the loader itself imports, such as React for auto-mounting. */
  extraSpecifiers?: string[];
  /** A page's own import map; its entries win over the resolved packages. */
  importMap?: ImportMap | null;
}

/**
 * An import map entry for a bare specifier that names no package (`@/x` with
 * no alias to resolve it): a module that fails, naming the specifier, rather
 * than a request to the CDN for a package called `@`.
 */
function unresolvedModuleUrl(specifier: string): string {
  const message = `Cannot import "${specifier}": it is not a package name, and no path alias in this project resolves it.`;
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(`throw new Error(${JSON.stringify(message)});`)}`;
}

/**
 * The module map, aliases and packages for one run — shared by a module
 * entry and a page's module scripts, so both resolve imports identically.
 *
 * Every workspace module has its path aliases (`@/x`) resolved, is rewritten
 * from its own published path (so `./Button` in `src/Card.tsx` means
 * `src/Button`) and given Vite's `import.meta.env` (see `shimImportMeta`).
 */
function buildWorkspace(files: PreviewFile[], options: WorkspaceOptions): Workspace {
  const {
    ensure, entries, extraModules = {}, extraSpecifiers = [], importMap = null,
  } = options;

  const published = new Set(files.map((file) => file.path));
  const pathAliases = readPathAliases(files);
  const scripts: Record<string, string> = {};
  const imported = new Set<string>();
  const dependencies = new Map<string, string[]>();

  const addModule = (target: Record<string, string>, path: string, original: string) => {
    const source = applyPathAliases(original, pathAliases);
    target[path] = shimImportMeta(rewriteImports(source, path));
    const found = collectDependencies(source, path);
    dependencies.set(path, found);
    for (const dependency of found) imported.add(dependency);
  };

  for (const file of files) {
    if (!RUNNABLE_SCRIPT.test(file.path)) continue;
    addModule(scripts, publishedPath(file.path, published), file.content);
  }
  if (ensure !== undefined && !(ensure in scripts)) scripts[ensure] = '';

  // From scripts alone: an asset import must name its extension, so
  // `./App` never quietly reaches `App.css`.
  const aliases = buildAliases(scripts);

  const inline: Record<string, string> = {};
  for (const [path, source] of Object.entries(extraModules)) addModule(inline, path, source);

  const code = { ...scripts, ...inline };
  const assets = assetModules(imported, code, aliases, files);
  Object.assign(aliases, assets.aliases);
  const modules = { ...code, ...assets.modules };

  // Scripts only: a generated JSON module's strings are data, not imports.
  const specifiers = [
    ...collectBareSpecifiers(Object.values(code)),
    ...extraSpecifiers,
    ...(assets.usesReact ? ['react'] : []),
  ];
  const { imports, unresolved } = resolvePackages(specifiers, readVersions(files));
  const packages: Record<string, string> = { ...imports };
  for (const specifier of unresolved) packages[specifier] = unresolvedModuleUrl(specifier);
  // The page named these itself, so they are what its code expects.
  if (importMap) Object.assign(packages, importMap.imports);

  return {
    modules,
    aliases,
    packages,
    scopes: importMap?.scopes ?? {},
    importsStyles: reachesStylesheet(entries, dependencies, code, aliases),
  };
}

/**
 * Whether any module reachable from `entries`, following workspace imports
 * transitively, imports a stylesheet that it applies — `?inline`, `?raw` and
 * `?url` only read one.
 */
function reachesStylesheet(
  entries: string[],
  dependencies: Map<string, string[]>,
  code: Record<string, string>,
  aliases: Record<string, string>,
): boolean {
  const seen = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const key = queue.shift() as string;
    const module = key in code ? key : aliases[key];

    if (module === undefined || !(module in code)) {
      const { path, query } = splitQuery(key);
      if (isStylesheet(path) && assetQueryOf(query) === null) return true;
      continue;
    }
    if (seen.has(module)) continue;
    seen.add(module);
    queue.push(...(dependencies.get(module) ?? []));
  }

  return false;
}

interface LoaderOptions {
  /** Render the entry's default export into `#root` (a module entry only). */
  mount?: boolean;
  /**
   * The entries run as native module scripts the page already contains (see
   * `buildPageDocument`); the loader only builds the map and reports.
   */
  native?: boolean;
}

/**
 * The JSON islands the loader reads, then the loader itself.
 *
 * One entry is named by `data-entry`; a page's several module scripts by
 * `data-entries`, a JSON list in document order.
 */
function loaderTags(workspace: Workspace, entries: string[], options: LoaderOptions = {}): string[] {
  const { mount = false, native = false } = options;
  const entryAttribute = entries.length === 1
    ? `data-entry="${escapeAttribute(entries[0])}"`
    : `data-entries="${escapeAttribute(JSON.stringify(entries))}"`;
  const flags = `${mount ? ' data-mount="default"' : ''}${native ? ' data-run="native"' : ''}`;
  const hasScopes = Object.keys(workspace.scopes).length > 0;

  return [
    `<script type="application/json" id="__workspace__" ${entryAttribute}${flags}>`,
    escapeJsonForScript(workspace.modules),
    '</script>',
    '<script type="application/json" id="__aliases__">',
    escapeJsonForScript(workspace.aliases),
    '</script>',
    '<script type="application/json" id="__packages__">',
    escapeJsonForScript(workspace.packages),
    '</script>',
    ...(hasScopes
      ? ['<script type="application/json" id="__scopes__">', escapeJsonForScript(workspace.scopes), '</script>']
      : []),
    `<script>${MODULE_LOADER}</script>`,
  ];
}

/**
 * Whether the loader should render the entry's default export.
 *
 * Lets a component file be just a component — `export default function App` —
 * the way CodeSandbox and StackBlitz treat it. Only for JSX sources, so a
 * plain script's default export is never mistaken for one, and never when the
 * file already calls `createRoot` itself.
 */
function shouldMountDefault(entry: string, source: string): boolean {
  if (!COMPONENT_SOURCE.test(entry)) return false;
  if (!/\bexport\s+default\b/.test(source)) return false;
  return !MOUNTS_ITSELF.test(source);
}

/** The file names a bundler tries, in order, when an import names a folder. */
const INDEX_SOURCES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

/**
 * Extra spellings that should resolve to an existing module.
 *
 * A module published as `util.js` may be imported as `./util` (extensionless),
 * `./util.ts` (the source name) or `./util.tsx`. A folder may be imported by
 * its name alone — `./components` or `./components/` — meaning its `index`
 * module. Import maps do no fallback resolution, so each accepted spelling
 * needs its own entry, pointing at the same module rather than duplicating its
 * source.
 *
 * Precedence follows Node and TypeScript: a real file always wins, then a
 * file's own spellings, and only then a folder's index — so with both
 * `components.ts` and `components/index.ts` present, `./components` is the
 * file. The two passes are what make that independent of listing order.
 */
export function buildAliases(modules: Record<string, string>): Record<string, string> {
  const aliases: Record<string, string> = {};

  const record = (alias: string, target: string) => {
    if (alias in modules || alias in aliases) return;
    aliases[alias] = target;
  };

  // `.js` keys first: when `Button.ts` and `Button.tsx` both exist, the one
  // published as `Button.js` is the one Vite resolves `./Button` to, and the
  // other (kept under its own name) must not claim that spelling first.
  const ordered = Object.keys(modules).sort((a, b) => Number(!/\.js$/i.test(a)) - Number(!/\.js$/i.test(b)));

  for (const path of ordered) {
    const base = path.replace(/\.[^./]+$/, '');
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.jsx`, `${base}.js`]) {
      if (candidate !== path) record(candidate, path);
    }
  }

  // Every source spelling of an index is published as `index.js` (or kept as
  // written, for a plain `.js`/`.jsx` that needed no transpiling), so the
  // folder alias points at whichever of those actually exists.
  const folders = new Set(
    Object.keys(modules)
      .filter((path) => /(^|\/)index\.[^./]+$/.test(path))
      .map(directoryOf),
  );

  for (const folder of folders) {
    const index = INDEX_SOURCES
      .map((name) => (folder ? `${folder}/${name}` : name))
      .map((path) => (path in modules ? path : aliases[path]))
      .find((target): target is string => Boolean(target));
    if (index) record(folder, index);
  }

  return aliases;
}

/** Whether the last segment of a path has an extension: `a/b.css`, not `a.b/c`. */
const HAS_EXTENSION = /\.[^./]+$/;

interface GeneratedAssets {
  /** Import key -> generated module source. */
  modules: Record<string, string>;
  /** Import keys that are a script under another spelling (`./a.js?v=2`). */
  aliases: Record<string, string>;
  /** Whether a generated module imports React (an SVG `?react` component). */
  usesReact: boolean;
}

/**
 * A generated module for every imported file that is not a script.
 *
 * Only what is actually imported, so an unrelated README or a folder of
 * images never ends up inlined into the document. An import that names a
 * missing file with an extension gets a module saying so by name; one
 * without an extension is left to the browser, as a missing script is —
 * unless a `.json` file has that name, which Vite would resolve too.
 *
 * An import with a query (`./logo.svg?react`, `./a.css?inline`) is looked up
 * by the file's path and published under the whole specifier. Vite's
 * `?raw`, `?url`, `?inline` and `?react` are honoured; any other query
 * (`?v=2`) names the file itself.
 */
function assetModules(
  imported: Set<string>,
  scripts: Record<string, string>,
  aliases: Record<string, string>,
  files: PreviewFile[],
): GeneratedAssets {
  // Vite serves `public/` at the root, so `import logo from '/vite.svg'` is
  // `public/vite.svg` when the root has no such file. Applied to any import
  // of a path the project lacks, which can only turn a certain "no such file"
  // into a working import.
  const lookup = lookupIn(files);
  const generated: GeneratedAssets = { modules: {}, aliases: {}, usesReact: false };

  for (const key of imported) {
    if (key in scripts || key in aliases) continue;

    const { path, query } = splitQuery(key);
    const kind = assetQueryOf(query);
    const script = path in scripts ? path : aliases[path];

    if (script !== undefined && kind === null) {
      generated.aliases[key] = script;
      continue;
    }

    const file = lookup(path)
      ?? (script !== undefined ? lookup(script) : undefined)
      ?? (HAS_EXTENSION.test(path) ? undefined : lookup(`${path}.json`));

    if (!file) {
      if (HAS_EXTENSION.test(path)) generated.modules[key] = missingAssetModule(path);
      continue;
    }

    if (kind === null) {
      // Named by the file's own path, so a stylesheet's `data-path` dedupe
      // holds however it was imported.
      generated.modules[key] = buildAssetModule(file.path, file.content, lookup);
    } else {
      generated.modules[key] = buildQueryAssetModule(file.path, kind, file.content, lookup);
      if (kind === 'react') generated.usesReact = true;
    }
  }

  return generated;
}

/** `<head>` or `<head …>`, but never `<header>`. */
const HEAD_TAG = /<head(?=[\s>])[^>]*>/i;
const HTML_TAG = /<html(?=[\s>])[^>]*>/i;

/** The synthetic module path for a page's nth inline module script. */
function inlineModulePath(page: string, index: number): string {
  return `${page}.module-${index}.js`;
}

/**
 * The module script put back where the page had one: it imports the resolved
 * module, so the browser runs it natively — deferred, in document order,
 * before `DOMContentLoaded` — exactly when the original would have run. A
 * module that does `addEventListener('DOMContentLoaded', init)` still gets
 * its event. A path the workspace lacks throws, naming it, as the loader's
 * own entries do.
 */
function nativeModuleScript(path: string, workspace: Workspace): string {
  const exists = path in workspace.modules || path in workspace.aliases;
  const body = exists
    ? `import ${escapeJsonForScript(`workspace:${path}`)};`
    : `throw new Error(${escapeJsonForScript(`Cannot run "${path}": there is no such file in this project.`)});`;
  return `<script type="module">${body}</script>`;
}

/**
 * An HTML entry runs as written, with the console bridge injected first.
 *
 * What a dev server would have answered is resolved here instead (see
 * `transformPage`): workspace module scripts — `src` or inline — import
 * modules from the same module map, aliases and packages as a module entry,
 * and linked workspace stylesheets are inlined where they were linked. The
 * page's own import map is folded into the loader's, which must be the only
 * one, with the page's entries winning.
 *
 * A page that links no workspace stylesheet, and whose modules reach none,
 * still gets its folder's CSS inlined: that is what a plain page with a
 * mistyped or missing `<link>` has always seen here.
 */
function buildPageDocument(html: string, files: PreviewFile[], entry: string): string {
  const page = transformPage(html, entry, files);
  const published = new Set(files.map((file) => file.path));

  const inline: Record<string, string> = {};
  let inlineCount = 0;
  const entries = page.modules.map((module) => {
    if (module.kind === 'src') return publishedPath(module.path, published);
    inlineCount += 1;
    const path = inlineModulePath(entry, inlineCount);
    inline[path] = module.source;
    return path;
  });

  const workspace = entries.length > 0
    ? buildWorkspace(files, { entries, extraModules: inline, importMap: page.importMap })
    : null;
  const inlineFolder = page.linkedStyles.length === 0 && !workspace?.importsStyles;

  const warnings = [...page.warnings];
  const folderStyles = inlineFolder ? styleTags(files, entry, lookupIn(files), warnings) : '';

  const head = [
    `<script>${CONSOLE_BRIDGE}</script>`,
    warningScript(warnings),
    BASE_STYLE,
    folderStyles,
    ...(workspace ? loaderTags(workspace, entries, { native: true }) : []),
  ].filter(Boolean).join('\n');

  let body = page.html;
  if (workspace) {
    entries.forEach((path, index) => {
      body = body.replace(modulePlaceholder(index), () => nativeModuleScript(path, workspace));
    });
  }

  if (HEAD_TAG.test(body)) {
    return body.replace(HEAD_TAG, (match) => `${match}\n${head}`);
  }
  if (HTML_TAG.test(body)) {
    return body.replace(HTML_TAG, (match) => `${match}<head>${head}</head>`);
  }
  return `<!doctype html>\n<html><head>${head}</head><body>\n${body}\n</body></html>`;
}
