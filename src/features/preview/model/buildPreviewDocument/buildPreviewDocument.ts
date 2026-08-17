import { rewriteImports } from '../rewriteImports/rewriteImports';
import { transpiledPath } from '../transpile/transpile';
import { CONSOLE_BRIDGE, MODULE_LOADER } from './runtime';

export interface PreviewFile {
  /** Path relative to the workspace root, e.g. `lib/math.js`. */
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

/** `</script` in user text must never close the tag it is embedded in. */
function escapeForScriptTag(text: string): string {
  return text.replace(/<\/(script)/gi, '<\\/$1');
}

function styleTags(files: PreviewFile[]): string {
  return files
    .filter((file) => STYLE.test(file.path))
    .map((file) => `<style data-path="${file.path}">\n${file.content}\n</style>`)
    .join('\n');
}

/** Neutral defaults, so a blank page is not a white flash inside a dark editor. */
const BASE_STYLE = `<style>
  html { color-scheme: light dark; }
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
    return buildPageDocument(page?.content ?? '', files);
  }

  const modules: Record<string, string> = {};
  for (const file of files) {
    if (!RUNNABLE_SCRIPT.test(file.path)) continue;
    modules[transpiledPath(file.path)] = rewriteImports(file.content);
  }

  // A TS entry is published as .js by the transpile step.
  const entryPath = transpiledPath(entry);

  // The entry must exist even when empty, or the loader imports `undefined`.
  if (!(entryPath in modules)) modules[entryPath] = '';

  const aliases = buildAliases(modules);

  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    BASE_STYLE,
    styleTags(files),
    '</head><body>',
    `<script type="application/json" id="__workspace__" data-entry="${entryPath}">`,
    escapeForScriptTag(JSON.stringify(modules)),
    '</script>',
    '<script type="application/json" id="__aliases__">',
    escapeForScriptTag(JSON.stringify(aliases)),
    '</script>',
    `<script>${CONSOLE_BRIDGE}</script>`,
    `<script>${MODULE_LOADER}</script>`,
    '</body></html>',
  ].join('\n');
}

/**
 * Extra spellings that should resolve to an existing module.
 *
 * A module published as `util.js` may be imported as `./util` (extensionless),
 * `./util.ts` (the source name) or `./util.tsx`. Import maps do no fallback
 * resolution, so each accepted spelling needs its own entry — pointing at the
 * same module rather than duplicating its source.
 *
 * A real file always wins: an alias is only recorded where nothing is
 * published under that name already.
 */
function buildAliases(modules: Record<string, string>): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const path of Object.keys(modules)) {
    const base = path.replace(/\.[^./]+$/, '');
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.jsx`, `${base}.js`]) {
      if (candidate === path) continue;
      if (candidate in modules) continue;
      if (candidate in aliases) continue;
      aliases[candidate] = path;
    }
  }

  return aliases;
}

/**
 * An HTML entry runs as written, with the console bridge injected first and
 * the workspace's stylesheets inlined — `<link href="./style.css">` has no
 * server to resolve against in here.
 */
function buildPageDocument(html: string, files: PreviewFile[]): string {
  const head = [BASE_STYLE, styleTags(files), `<script>${CONSOLE_BRIDGE}</script>`].join('\n');

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${head}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${head}</head>`);
  }
  return `<!doctype html>\n<html><head>${head}</head><body>\n${html}\n</body></html>`;
}
