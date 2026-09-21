/**
 * Just enough of Vite's `import.meta` for a Vite project to run unbundled.
 *
 * A browser gives a module an `import.meta` with only `url` and `resolve` on
 * it, so the first `import.meta.env.DEV` in a Vite app reads a property of
 * `undefined` and the whole app stops. Vite fills `env` in at build time; the
 * preview has no build, so it does the same textually: every mention in code
 * becomes a read of the module's own copy of an object the module loader
 * defines before any module runs.
 */

/** The global the loader defines and rewritten modules read. */
export const VITE_ENV_GLOBAL = '__spaceViteEnv';

/**
 * What `vite dev` reports. Only the built-in keys: `VITE_*` values come from
 * `.env` files the preview does not read, so they are simply `undefined`, as
 * they are in Vite when the variable is not set.
 */
export const VITE_ENV = Object.freeze({
  MODE: 'development',
  DEV: true,
  PROD: false,
  SSR: false,
  BASE_URL: '/',
});

/**
 * The per-module binding rewritten code reads: a copy of the loader's object,
 * made when the module is evaluated. A copy because Vite gives each module its
 * own plain object, which code may add to (`import.meta.env.FOO = …`) — the
 * shared global is frozen, and assigning to it in module (strict) code throws.
 */
export const IMPORT_META_ENV_BINDING = '__spaceImportMetaEnv';

/*
 * Whitespace is allowed around the dots because it is legal there, and the
 * trailing `\b` keeps `import.meta.environment` (not Vite's) untouched. Built
 * with `\s*` rather than as the literal text so no tool that rewrites
 * `import.meta.env` in *this* app's source can mistake the pattern for a use.
 */
const IMPORT_META_ENV = /\bimport\s*\.\s*meta\s*\.\s*env\b/g;
const IMPORT_META_HOT = /\bimport\s*\.\s*meta\s*\.\s*hot\b/g;

/** What may precede a `/` that starts a regular expression rather than a division. */
const REGEX_CONTEXT = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await|instanceof))\s*$/;

/** Index just past the quoted string opening at `start`. */
function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length && source[index] !== quote && source[index] !== '\n') {
    index += source[index] === '\\' ? 2 : 1;
  }
  return Math.min(index + 1, source.length);
}

/** Index just past the regular expression literal opening at `start`. */
function skipRegex(source: string, start: number): number {
  let index = start + 1;
  let inClass = false;
  while (index < source.length && source[index] !== '\n') {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) break;
    index += 1;
  }
  index += 1;
  while (index < source.length && /[a-z]/i.test(source[index])) index += 1;
  return Math.min(index, source.length);
}

/**
 * Template text from `start` up to its closing backtick, or up to a `${`.
 * Returns where the text ends and whether an expression opened there.
 */
function skipTemplateText(source: string, start: number): { end: number; opensExpression: boolean } {
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '`') return { end: index + 1, opensExpression: false };
    if (char === '$' && source[index + 1] === '{') return { end: index + 2, opensExpression: true };
    index += 1;
  }
  return { end: source.length, opensExpression: false };
}

/**
 * Applies `transform` to the code of a module only — never to the inside of a
 * string, a template's text, a comment or a regular expression.
 *
 * A lexer, not a parser: enough to tell text from code, including code in a
 * template's `${…}`. JSX text is already a string literal by the time this runs
 * (the transpile step compiles it), so `<code>…</code>` in a docs component is
 * text here too.
 */
export function mapCode(source: string, transform: (code: string) => string): string {
  let output = '';
  let code = '';
  /** One entry per open `{`: whether it closes a template's `${`. */
  const braces: boolean[] = [];
  let index = 0;

  const flush = () => {
    output += transform(code);
    code = '';
  };
  const recent = () => (code.length >= 24 ? code : output.slice(-24) + code).slice(-24);

  const text = (end: number) => {
    flush();
    output += source.slice(index, end);
    index = end;
  };

  const template = (from: number) => {
    const { end, opensExpression } = skipTemplateText(source, from);
    text(end);
    if (opensExpression) braces.push(true);
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      text(end === -1 ? source.length : end);
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      text(end === -1 ? source.length : end + 2);
    } else if (char === '"' || char === "'") {
      text(skipQuoted(source, index));
    } else if (char === '`') {
      template(index + 1);
    } else if (char === '/' && REGEX_CONTEXT.test(recent())) {
      text(skipRegex(source, index));
    } else if (char === '{') {
      braces.push(false);
      code += char;
      index += 1;
    } else if (char === '}' && braces[braces.length - 1] === true) {
      braces.pop();
      // The `}` ends the expression and resumes the template's text.
      template(index + 1);
    } else {
      if (char === '}') braces.pop();
      code += char;
      index += 1;
    }
  }

  flush();
  return output;
}

/**
 * Rewrites `import.meta.env` to a per-module copy of the loader's object and
 * `import.meta.hot` to `undefined`.
 *
 * `hot` is `undefined` rather than a stub because that is what it is in a
 * Vite production build, so every app already guards it — `if
 * (import.meta.hot)`, `import.meta.hot?.accept()` — and a stub that pretended
 * to accept updates would promise something the preview never delivers.
 *
 * Only code is rewritten (see `mapCode`): a tutorial component that shows
 * `import.meta.env.VITE_URL` as text keeps showing exactly that. The copy is
 * declared on the module's first line, so no line number moves.
 */
export function shimImportMeta(source: string): string {
  if (!source.includes('meta')) return source;

  let usesEnv = false;
  const output = mapCode(source, (code) => code
    .replace(IMPORT_META_ENV, () => {
      usesEnv = true;
      return IMPORT_META_ENV_BINDING;
    })
    .replace(IMPORT_META_HOT, 'undefined'));

  if (!usesEnv) return output;
  return `const ${IMPORT_META_ENV_BINDING} = Object.assign({}, globalThis.${VITE_ENV_GLOBAL}); ${output}`;
}
