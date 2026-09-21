import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';
import { resolveWorkspaceUrl } from '../rewriteImports/rewriteImports';

/**
 * Resolving what a stylesheet references — `@import` and `url()` — at build
 * time, the way Vite does.
 *
 * A stylesheet ends up in a `<style>` inside an opaque-origin `srcdoc` frame,
 * where `@import './vars.css'` or `url(./bg.svg)` resolves against the editor's
 * own URL: it fetches nothing from the workspace, so the rules or the image are
 * silently missing. Workspace stylesheets are inlined in place instead (in the
 * cascade position the `@import` gave them), and workspace SVGs become `data:`
 * URLs. What cannot be resolved is left as written and reported.
 */

/** Finds a workspace file by path, or undefined. */
export type FileLookup = (path: string) => PreviewFile | undefined;

export interface ResolvedCss {
  css: string;
  /** One line per reference that could not be resolved, for the preview console. */
  warnings: string[];
}

/** A lookup over `files`, with Vite's `public/` fallback for a path the root lacks. */
export function lookupIn(files: PreviewFile[]): FileLookup {
  const byPath = new Map(files.map((file) => [file.path, file]));
  return (path) => byPath.get(path) ?? byPath.get(`public/${path}`);
}

/*
 * A comment first, so a commented-out `@import` or `url()` is skipped whole.
 * The `@import` statement comes before `url()` in the second pattern, so the
 * `url(...)` inside one is never taken for an asset reference.
 */
const IMPORT = /\/\*[\s\S]*?\*\/|@import\s+(?:url\(\s*(['"]?)([^'")]*)\1\s*\)|(['"])([^'"]*)\3)([^;]*);/gi;
const URL_OR_IMPORT = /\/\*[\s\S]*?\*\/|@import\b[^;]*;|\burl\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
const CHARSET = /@charset\s+(['"])[^'"]*\1\s*;/gi;
const SVG = /\.svg$/i;
const STYLESHEET = /\.css$/i;

/** `layer(x) supports(display: grid) screen` -> the at-rules to wrap the inlined rules in. */
function wrapConditions(css: string, conditions: string): string {
  let rest = conditions.trim();
  let wrapped = css;
  const wrappers: string[] = [];

  const layer = /^layer(?:\(([^)]*)\))?\s*/i.exec(rest);
  if (layer) {
    wrappers.push(layer[1] ? `@layer ${layer[1].trim()}` : '@layer');
    rest = rest.slice(layer[0].length);
  }
  const supports = /^supports\(((?:[^()]|\([^()]*\))*)\)\s*/i.exec(rest);
  if (supports) {
    wrappers.push(`@supports (${supports[1].trim()})`);
    rest = rest.slice(supports[0].length);
  }
  if (rest.trim()) wrappers.push(`@media ${rest.trim()}`);

  // Innermost last: layer { supports { media { rules } } }.
  for (const wrapper of wrappers.reverse()) wrapped = `${wrapper} {\n${wrapped}\n}`;
  return wrapped;
}

function resolveUrls(css: string, path: string, lookup: FileLookup, warnings: string[]): string {
  return css.replace(URL_OR_IMPORT, (match, _quote: string | undefined, url: string | undefined) => {
    if (url === undefined) return match;

    const target = resolveWorkspaceUrl(url, path);
    if (target === null) return match;

    const file = lookup(target);
    if (!file) {
      warnings.push(`${path}: url(${url}) names no file in this project, so it will not load.`);
      return match;
    }
    if (!SVG.test(file.path)) {
      warnings.push(`${path}: url(${url}) cannot load in the preview — only .svg files can be `
        + 'referenced from CSS, since files are stored as text.');
      return match;
    }

    const hash = /#.*$/.exec(url.trim())?.[0] ?? '';
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.content)}${hash}")`;
  });
}

interface Inlined {
  css: string;
  /** External `@import`s, which must come before every rule and so are hoisted. */
  external: string[];
}

function inline(
  css: string,
  path: string,
  lookup: FileLookup,
  stack: string[],
  warnings: string[],
): Inlined {
  const external: string[] = [];
  // url() first, against this file's own folder: once a child is inlined,
  // its unresolved references must not be re-read against the parent's.
  const withUrls = resolveUrls(css, path, lookup, warnings);

  const output = withUrls.replace(
    IMPORT,
    (match, _q1: string | undefined, url1: string | undefined, _q2: string | undefined, url2: string | undefined, conditions: string | undefined) => {
      if (match.startsWith('/*')) return match;

      const url = url1 ?? url2 ?? '';
      const target = resolveWorkspaceUrl(url, path);
      if (target === null) {
        external.push(match);
        return '';
      }

      const file = lookup(target);
      if (!file || !STYLESHEET.test(file.path)) {
        warnings.push(`${path}: @import "${url}" names no stylesheet in this project, so it was skipped.`);
        return '';
      }
      // A cycle would inline forever; the browser applies each file once anyway.
      if (stack.includes(file.path)) return '';

      const child = inline(file.content.replace(CHARSET, ''), file.path, lookup, [...stack, file.path], warnings);
      external.push(...child.external);
      return wrapConditions(child.css, conditions ?? '');
    },
  );

  return { css: output, external };
}

/**
 * `css` (the content of the stylesheet at `path`) with every workspace
 * `@import` inlined, recursively and once per chain, and every workspace SVG
 * `url()` turned into a `data:` URL.
 */
export function resolveCssReferences(css: string, path: string, lookup: FileLookup): ResolvedCss {
  if (!/@import|url\(/i.test(css)) return { css, warnings: [] };

  const warnings: string[] = [];
  const { css: body, external } = inline(css, path, lookup, [path], warnings);
  const resolved = external.length > 0 ? `${external.join('\n')}\n${body}` : body;
  return { css: resolved, warnings };
}
