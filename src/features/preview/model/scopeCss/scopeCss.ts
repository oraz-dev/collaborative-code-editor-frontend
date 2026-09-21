export interface ScopedCss {
  /** The stylesheet with every class selector renamed. */
  css: string;
  /**
   * Original class name -> scoped class name, as a CSS module's default
   * export. A kebab-case name is also listed under its camelCase spelling, so
   * `.card-title` is reachable as `cls.cardTitle` as well as `cls['card-title']`.
   */
  classes: Record<string, string>;
}

/**
 * What the body of a `{ … }` block holds, which decides whether the prelude of
 * a block nested inside it is a selector.
 *
 * - `rules`: the top level, a grouping at-rule (`@media`, `@supports` …) or a
 *   style rule, whose nested blocks are rules — CSS nesting included.
 * - `opaque`: `@keyframes` and descriptor blocks (`@font-face`, `@page` …).
 *   `from`, `to` and `12.5%` are not selectors and must be left alone.
 */
type BlockKind = 'rules' | 'opaque';

/** At-rules whose body is more rules, so their children are scoped. */
const GROUPING_AT_RULE = /^@(?:media|supports|container|layer|scope|document|starting-style)\b/i;

/**
 * A short, stable hash of a file's path — FNV-1a, 32 bits, base 36.
 *
 * Stable so a class keeps its name across runs and between the stylesheet and
 * the object that maps to it; derived from the path so two files that both
 * declare `.title` get different names, which is the point of a CSS module.
 */
export function hashPath(path: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** `card-title` -> `cardTitle`; a name without dashes comes back unchanged. */
export function camelCase(name: string): string {
  return name.replace(/-+([a-zA-Z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

const IDENT_START = /[_a-zA-Z\u00A0-\uFFFF]/;
const IDENT_CHAR = /[-_a-zA-Z0-9\u00A0-\uFFFF]/;

/** Index just past the string literal opening at `start`. */
function skipString(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length && text[index] !== quote) {
    index += text[index] === '\\' ? 2 : 1;
  }
  return Math.min(index + 1, text.length);
}

/** Index just past the comment opening at `start`; an unclosed one runs to the end. */
function skipComment(text: string, start: number): number {
  const end = text.indexOf('*/', start + 2);
  return end === -1 ? text.length : end + 2;
}

/** Index of the `)` matching the `(` at `open`, or the end if there is none. */
function matchParen(text: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index = skipString(text, index);
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return text.length;
}

/** Whether a class name starts at `index`: `.card`, `.-x`, but never `.5`. */
function startsIdent(text: string, index: number): boolean {
  const char = text[index];
  if (char === undefined) return false;
  if (char === '-') {
    const next = text[index + 1];
    return next !== undefined && (next === '-' || IDENT_START.test(next));
  }
  return IDENT_START.test(char);
}

/**
 * Renames every class in one selector prelude (`.a:hover, .b > .c`).
 *
 * Strings, comments and attribute selectors are copied untouched —
 * `[href$=".pdf"]` has a dot that is not a class. The CSS Modules escape
 * hatches are honoured and removed, since no browser knows them:
 *
 * - `:global(.x)` keeps its contents as written; `:local(.x)` scopes them.
 * - Bare `:global` leaves every class after it in the same selector (up to
 *   the next top-level comma) unscoped; bare `:local` switches back.
 */
function scopeSelector(prelude: string, suffix: string, classes: Record<string, string>): string {
  let output = '';
  let index = 0;
  let global = false;
  let depth = 0;

  /** Drops a bare keyword, and the space after it when it began a compound. */
  const skipKeyword = (keyword: string) => {
    index += keyword.length;
    if (output === '' || /\s$/.test(output)) {
      while (index < prelude.length && /\s/.test(prelude[index])) index += 1;
    }
  };

  while (index < prelude.length) {
    const char = prelude[index];

    if (char === '"' || char === "'") {
      const end = skipString(prelude, index);
      output += prelude.slice(index, end);
      index = end;
      continue;
    }

    if (char === '/' && prelude[index + 1] === '*') {
      const end = skipComment(prelude, index);
      output += prelude.slice(index, end);
      index = end;
      continue;
    }

    if (char === '[') {
      let end = index + 1;
      while (end < prelude.length && prelude[end] !== ']') {
        end = prelude[end] === '"' || prelude[end] === "'" ? skipString(prelude, end) : end + 1;
      }
      end = Math.min(end + 1, prelude.length);
      output += prelude.slice(index, end);
      index = end;
      continue;
    }

    if (char === '\\') {
      output += prelude.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (prelude.startsWith(':global(', index)) {
      const open = index + ':global'.length;
      const close = matchParen(prelude, open);
      output += prelude.slice(open + 1, close);
      index = close + 1;
      continue;
    }

    if (prelude.startsWith(':local(', index)) {
      const open = index + ':local'.length;
      const close = matchParen(prelude, open);
      output += scopeSelector(prelude.slice(open + 1, close), suffix, classes);
      index = close + 1;
      continue;
    }

    if (isBareKeyword(prelude, index, ':global')) {
      global = true;
      skipKeyword(':global');
      continue;
    }

    if (isBareKeyword(prelude, index, ':local')) {
      global = false;
      skipKeyword(':local');
      continue;
    }

    if (char === '.' && startsIdent(prelude, index + 1)) {
      let end = index + 1;
      while (end < prelude.length && IDENT_CHAR.test(prelude[end])) end += 1;
      const name = prelude.slice(index + 1, end);
      if (global) {
        output += `.${name}`;
      } else {
        const scoped = `${name}_${suffix}`;
        classes[name] = scoped;
        output += `.${scoped}`;
      }
      index = end;
      continue;
    }

    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    // Each selector in a list starts local again.
    if (char === ',' && depth === 0) global = false;

    output += char;
    index += 1;
  }

  return output;
}

/** `:global` or `:local` at `index`, not followed by `(` or more of a name. */
function isBareKeyword(text: string, index: number, keyword: string): boolean {
  if (!text.startsWith(keyword, index)) return false;
  const next = text[index + keyword.length];
  return next === undefined || (next !== '(' && !IDENT_CHAR.test(next));
}

/** The kind of block a `{` opens, given the prelude before it and where it sits. */
function kindOf(prelude: string, parent: BlockKind): BlockKind {
  const trimmed = prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (trimmed.startsWith('@')) return GROUPING_AT_RULE.test(trimmed) ? 'rules' : 'opaque';
  return parent;
}

/**
 * Scopes a CSS module: every class selector becomes `name_<hash of path>`.
 *
 * The scanner only ever rewrites the text right before a `{` — a selector
 * prelude — so a declaration value (`0.5em`, `url(./a.b.png)`, `"…"`) can
 * never be touched however many dots it has. It tracks what kind of block it
 * is in, so the preludes inside `@keyframes` (`from`, `12.5%`) and at-rule
 * preludes (`@media (min-width: 0.5em)`) are left alone, while rules inside
 * `@media`, `@supports` and nested style rules are scoped at any depth.
 *
 * A tokenizer, not a parser: malformed CSS comes out as malformed as it went
 * in, just renamed, which is what the browser would have been given anyway.
 */
export function scopeCss(css: string, path: string): ScopedCss {
  const suffix = hashPath(path);
  const found: Record<string, string> = {};
  const stack: BlockKind[] = [];
  let output = '';
  /** Where the text since the last `{`, `}` or `;` began. */
  let segment = 0;
  let index = 0;

  while (index < css.length) {
    const char = css[index];

    if (char === '"' || char === "'") {
      index = skipString(css, index);
      continue;
    }
    if (char === '/' && css[index + 1] === '*') {
      index = skipComment(css, index);
      continue;
    }
    if (char === '\\') {
      index += 2;
      continue;
    }
    // A `url(data:…;…)` or `;` inside parentheses is not a statement boundary.
    if (char === '(') {
      index = matchParen(css, index) + 1;
      continue;
    }

    if (char === '{') {
      const parent = stack[stack.length - 1] ?? 'rules';
      const prelude = css.slice(segment, index);
      const kind = kindOf(prelude, parent);
      const isSelector = parent === 'rules' && !prelude.trim().startsWith('@');
      output += isSelector ? scopeSelector(prelude, suffix, found) : prelude;
      output += '{';
      stack.push(isSelector ? 'rules' : kind);
      segment = index + 1;
    } else if (char === '}' || char === ';') {
      output += css.slice(segment, index + 1);
      if (char === '}') stack.pop();
      segment = index + 1;
    }

    index += 1;
  }

  output += css.slice(segment);

  const classes: Record<string, string> = { ...found };
  for (const [name, scoped] of Object.entries(found)) {
    const camel = camelCase(name);
    if (!(camel in classes)) classes[camel] = scoped;
  }

  return { css: output, classes };
}
