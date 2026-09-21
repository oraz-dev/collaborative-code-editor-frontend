import { scopeCss } from '../scopeCss/scopeCss';
import { resolveCssReferences, type FileLookup } from '../cssReferences/cssReferences';

/**
 * How the preview turns a non-script file into something `import` can load.
 *
 * The preview has no bundler: every workspace module is a `data:` URL in an
 * import map, and a browser will only evaluate JavaScript from one of those.
 * So a stylesheet, a JSON file or an SVG is published as a small generated
 * module that does what a bundler's loader would — inject the rules, export
 * the value — under the file's own path, with its extension, exactly where a
 * relative import of it resolves.
 */
export type AssetKind = 'css' | 'css-module' | 'json' | 'svg' | 'unsupported';

const CSS_MODULE = /\.module\.css$/i;
const CSS = /\.css$/i;
const JSON_FILE = /\.json$/i;
const SVG = /\.svg$/i;
/** Stylesheet languages that need a compiler the preview does not ship. */
const PREPROCESSED = /\.(scss|sass|less|styl|stylus)$/i;

export function assetKindOf(path: string): AssetKind {
  if (CSS_MODULE.test(path)) return 'css-module';
  if (CSS.test(path)) return 'css';
  if (JSON_FILE.test(path)) return 'json';
  if (SVG.test(path)) return 'svg';
  return 'unsupported';
}

/** Whether an import of this file pulls in a stylesheet, module or not. */
export function isStylesheet(path: string): boolean {
  return CSS.test(path);
}

function extensionOf(path: string): string {
  const match = /\.([^./]+)$/.exec(path);
  return match ? `.${match[1].toLowerCase()}` : '';
}

/** A module that fails on evaluation, so the reason lands in the preview console. */
function throwingModule(message: string): string {
  return `throw new Error(${JSON.stringify(message)});\n`;
}

/**
 * Appends the stylesheet to `<head>` when the module is evaluated.
 *
 * At evaluation, not at build time, so the cascade follows import order: a
 * module's dependencies run before it, so their rules come first and its own
 * can override them, as they would in a bundled app. A module only ever
 * evaluates once, but the `data-path` guard also keeps one copy per file when
 * a page's `<link>` already inlined it — anywhere in the document, since a
 * link may sit in `<body>`.
 */
function injectStyle(path: string, css: string): string {
  return [
    '(function () {',
    `  var path = ${JSON.stringify(path)};`,
    "  var existing = document.querySelectorAll('style[data-path]');",
    '  for (var i = 0; i < existing.length; i += 1) {',
    "    if (existing[i].getAttribute('data-path') === path) return;",
    '  }',
    "  var style = document.createElement('style');",
    "  style.setAttribute('data-path', path);",
    `  style.textContent = ${JSON.stringify(css)};`,
    '  document.head.appendChild(style);',
    '})();',
  ].join('\n');
}

/**
 * Why an import of `path` cannot be loaded, worded for the preview console:
 * the file named, and what to do instead.
 */
export function unsupportedAssetMessage(path: string): string {
  const extension = extensionOf(path) || 'this kind of';
  if (PREPROCESSED.test(path)) {
    return `Cannot import "${path}": ${extension} files need a compiler the preview does not include. `
      + 'Use a plain .css file (or a .module.css file for scoped classes) instead.';
  }
  return `Cannot import "${path}": ${extension} files are not supported in the preview. `
    + 'Files are stored as text, so only .css, .module.css, .json and .svg can be imported besides scripts.';
}

/** `console.warn` lines for what a stylesheet references but cannot load. */
function warningLines(warnings: string[]): string {
  return warnings.map((warning) => `console.warn(${JSON.stringify(warning)});\n`).join('');
}

/** The stylesheet with its workspace `@import`s and SVG `url()`s resolved, when it can be. */
function resolvedCss(path: string, content: string, lookup?: FileLookup): { css: string; warnings: string } {
  if (!lookup) return { css: content, warnings: '' };
  const { css, warnings } = resolveCssReferences(content, path, lookup);
  return { css, warnings: warningLines(warnings) };
}

/*
 * Names a JSON key cannot be exported under: reserved words, and the local
 * that holds the value.
 */
const RESERVED = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let',
  'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  '__spaceJson',
]);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * A JSON module as Vite builds one: the value as the default export, and each
 * top-level key of an object that can be a binding as a named export — so
 * `import { version } from './package.json'` links, rather than failing the
 * whole module graph with "does not provide an export named version". The
 * named exports are destructured from the default, so both are one value.
 */
function jsonModule(value: unknown): string {
  const lines = [`const __spaceJson = ${JSON.stringify(value)};`, 'export default __spaceJson;'];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const names = Object.keys(value).filter((key) => IDENTIFIER.test(key) && !RESERVED.has(key));
    if (names.length > 0) lines.push(`export const { ${names.join(', ')} } = __spaceJson;`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The generated module for an imported non-script file.
 *
 * Never throws: a file that cannot be turned into a module becomes one that
 * throws *when imported*, so the error names the file in the preview console
 * and the rest of the document still builds.
 *
 * `lookup` finds the other workspace files a stylesheet references; without
 * it, `@import` and `url()` are left as written.
 */
export function buildAssetModule(path: string, content: string, lookup?: FileLookup): string {
  switch (assetKindOf(path)) {
    case 'css': {
      const { css, warnings } = resolvedCss(path, content, lookup);
      return `${warnings}${injectStyle(path, css)}\nexport default {};\n`;
    }

    case 'css-module': {
      // Inlined before scoping, as postcss-import runs before CSS modules.
      const resolved = resolvedCss(path, content, lookup);
      const { css, classes } = scopeCss(resolved.css, path);
      return `${resolved.warnings}${injectStyle(path, css)}\nexport default ${JSON.stringify(classes)};\n`;
    }

    case 'json': {
      try {
        // Parsed here and re-serialised, so the module is always a valid
        // expression — and bad JSON is reported by file, not as a syntax
        // error somewhere inside a data: URL.
        const value: unknown = JSON.parse(content);
        return jsonModule(value);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return throwingModule(`Cannot import "${path}": it is not valid JSON (${reason}).`);
      }
    }

    case 'svg':
      // A URL rather than markup, so `<img src={logo}>` works as it does
      // with a bundler. Percent-encoded rather than base64: smaller for text.
      return `export default ${JSON.stringify(dataUrl(path, content))};\n`;

    default:
      return throwingModule(unsupportedAssetMessage(path));
  }
}

/** A module for an import that names a file the project does not contain. */
export function missingAssetModule(path: string): string {
  return throwingModule(`Cannot import "${path}": there is no such file in this project.`);
}

/** The Vite import queries the preview understands. */
export type AssetQuery = 'raw' | 'url' | 'inline' | 'react';

const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html',
};

/** The file as a `data:` URL: what `?url` and `?inline` give for an asset. */
export function dataUrl(path: string, content: string): string {
  const mime = MIME_TYPES[extensionOf(path)] ?? 'text/plain';
  return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
}

/**
 * What a `?query` on an import asks for: one of Vite's asset queries, an
 * unsupported one (`?worker`), or null for a query that only busts a cache
 * (`?v=2`) and names the file itself.
 */
export function assetQueryOf(query: string): AssetQuery | 'unsupported' | null {
  if (!query.startsWith('?')) return null;
  const keys = [...new URLSearchParams(query.slice(1).replace(/#.*$/, '')).keys()];
  if (keys.includes('worker') || keys.includes('sharedworker')) return 'unsupported';
  const known = (['raw', 'url', 'inline', 'react'] as const).find((key) => keys.includes(key));
  return known ?? null;
}

/*
 * The svgr-style component `?react` gives: the file's root `<svg>` element,
 * with its attributes as React props (overridable by the caller's), and its
 * markup inside. Parsed at evaluation, where the frame has a DOMParser.
 */
const SVG_COMPONENT = String.raw`
var parsed = new DOMParser().parseFromString(__spaceSvg, 'image/svg+xml').documentElement;
var rootProps = {};
function camel(name) { return name.replace(/[-:]([a-z])/g, function (_m, c) { return c.toUpperCase(); }); }
Array.prototype.forEach.call(parsed.attributes, function (attribute) {
  var name = attribute.name;
  if (name === 'class') rootProps.className = attribute.value;
  else if (name === 'style') {
    var style = {};
    attribute.value.split(';').forEach(function (part) {
      var colon = part.indexOf(':');
      if (colon > 0) style[camel(part.slice(0, colon).trim())] = part.slice(colon + 1).trim();
    });
    rootProps.style = style;
  } else if (/^(data|aria)-/.test(name)) rootProps[name] = attribute.value;
  else rootProps[camel(name)] = attribute.value;
});
var markup = parsed.innerHTML;
function SvgComponent(props) {
  var merged = Object.assign({}, rootProps, props, { dangerouslySetInnerHTML: { __html: markup } });
  delete merged.children;
  return createElement('svg', merged);
}
export default SvgComponent;
export { SvgComponent as ReactComponent };
`;

/**
 * The generated module for an import with one of Vite's queries: `?raw` (the
 * text), `?url` (a URL to it — a `data:` URL here), `?inline` (a stylesheet's
 * text without applying it, or an asset's `data:` URL), `?react` (an SVG as a
 * component, as vite-plugin-svgr gives).
 *
 * `path` is the file's own path; the module is published under the import's
 * full specifier, query included.
 */
export function buildQueryAssetModule(
  path: string,
  query: AssetQuery | 'unsupported',
  content: string,
  lookup?: FileLookup,
): string {
  switch (query) {
    case 'raw':
      return `export default ${JSON.stringify(content)};\n`;

    case 'url':
      return `export default ${JSON.stringify(dataUrl(path, content))};\n`;

    case 'inline':
      if (assetKindOf(path) === 'css' || assetKindOf(path) === 'css-module') {
        const { css, warnings } = resolvedCss(path, content, lookup);
        return `${warnings}export default ${JSON.stringify(css)};\n`;
      }
      return `export default ${JSON.stringify(dataUrl(path, content))};\n`;

    case 'react':
      if (assetKindOf(path) !== 'svg') {
        return throwingModule(`Cannot import "${path}?react": only an .svg file can be imported as a component.`);
      }
      return `import { createElement } from 'react';\nvar __spaceSvg = ${JSON.stringify(content)};\n${SVG_COMPONENT}`;

    default:
      return throwingModule(`Cannot import "${path}" with that query: Vite's ?worker imports are not supported in the preview.`);
  }
}
