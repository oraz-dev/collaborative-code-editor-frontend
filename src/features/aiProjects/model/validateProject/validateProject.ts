import {
  applyPathAliases,
  buildAliases,
  collectDependencies,
  detectProjectEntry,
  hasModuleScript,
  lookupIn,
  parsePlainScripts,
  projectTypeInfo,
  readPathAliases,
  splitQuery,
  transpileWorkspace,
} from '@/features/preview';
import { TAILWIND_CDN } from '../prompts/prompts';
import type { ProjectFile } from '../streamJson/streamJson';

/**
 * Checks a generated project against the runtime that will actually run it.
 *
 * A model writes plausible code, not code for *this* sandbox: it reaches for a
 * build step that does not exist, a `tailwind.config.js` nothing reads, a
 * `BrowserRouter` with no URL bar to drive it. Rather than trusting the prompt
 * to have prevented that, every rule the prompt states is checked here with
 * the preview's own resolution code — `collectDependencies`, `buildAliases`,
 * `detectProjectEntry`, `transpileWorkspace` — so a project that passes is one
 * the preview can load, and the two can never drift apart.
 *
 * Each problem carries a `hint`, which is the sentence sent back to the model
 * in the repair round. That is why the hints are imperative and name the file:
 * they are instructions, not diagnostics.
 *
 * Errors stop the project running. Warnings would merely disappoint — the page
 * appears, just with an unused config file or a suspiciously long component.
 * Only errors are worth a second round trip to a rate-limited free model.
 */

export interface ProjectProblem {
  /** The file the problem is in; `''` when it is about the project as a whole. */
  path: string;
  /** Shown to the user. */
  message: string;
  /** Sent to the model on repair: what to change, in the imperative. */
  hint: string;
}

export interface ValidationReport {
  errors: ProjectProblem[];
  warnings: ProjectProblem[];
}

/** Files the sandbox compiles and runs as modules. */
const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
/** Everything an import may name here (rule 7), plus the extensionless form. */
const IMPORTABLE = /\.(?:[cm]?[jt]s|[jt]sx|css|json|svg)$/i;
const HAS_EXTENSION = /\.[^./]+$/;
/** Assets that cannot exist in a text-only document store. */
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|tiff?|mp[34]|wav|ogg|webm|woff2?|ttf|otf|eot|pdf|zip)$/i;
const PAGE = 'index.html';

/**
 * Long enough that the model has stopped writing a component and started
 * writing a file. A warning only: long files run perfectly well.
 */
const MAX_LINES = 150;

/**
 * Packages that only ever exist to build something. There is no build step
 * here, so listing one is not a harmless extra: it is the model telling us it
 * wrote the project for a toolchain this runtime does not have, and the rest
 * of its answer usually assumes that toolchain too.
 */
const BUILD_ONLY = /^(?:@types\/|@vitejs\/|@tailwindcss\/|@babel\/|babel-|tailwindcss$|postcss$|autoprefixer$|vite$|typescript$|eslint|prettier$|webpack|rollup$|parcel$|esbuild$|sass$|node-sass$|less$|@rollup\/)/;

/** Node's own modules, imported bare. None of them exist in a browser tab. */
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs',
  'http', 'http2', 'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'querystring',
  'readline', 'stream', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
]);

/** `class="…"`, `className="…"`, `className={\`…\`}` — where utilities live. */
const CLASS_ATTRIBUTE = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*[`'"]([^`'"]*)[`'"])/g;

/**
 * A Tailwind utility rather than a hand-written class name.
 *
 * Both halves are needed: `my-component` starts like `my-4` and `text-body`
 * like `text-sm`, so the suffix has to look like a Tailwind scale too.
 */
const TAILWIND_UTILITY = /\b(?:bg|text|border|rounded|shadow|flex|grid|gap|p[xytblre]?|m[xytblre]?|w|h|items|justify|font|leading|tracking|space-[xy]|divide|ring)-(?:\d|\[|px|auto|full|screen|none|center|between|around|start|end|bold|semibold|medium|light|xs|sm|md|lg|xl|2xl|3xl|white|black|transparent|current|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/;

const TAILWIND_DIRECTIVE = /@(?:tailwind|apply)\b/;
const TAILWIND_CONFIG = /^(?:tailwind|postcss)\.config\.[cm]?[jt]s$/i;

function problem(path: string, message: string, hint: string): ProjectProblem {
  return { path, message, hint };
}

/** Lines, counted the way an editor shows them. */
function lineCount(content: string): number {
  return content.split('\n').length;
}

function classValues(content: string): string[] {
  return [...content.matchAll(CLASS_ATTRIBUTE)]
    .map(([, double, single, braced]) => double ?? single ?? braced ?? '');
}

/** `.flex-center { … }` — a class the project's own stylesheets define. */
const CSS_CLASS_SELECTOR = /\.(-?[_a-zA-Z][\w-]*)/g;
const STYLESHEET = /\.css$/i;

/** Every class name the project defines for itself, from its own .css files. */
function definedClasses(files: ProjectFile[]): Set<string> {
  const defined = new Set<string>();

  for (const file of files) {
    if (!STYLESHEET.test(file.path)) continue;
    for (const [, name] of file.content.matchAll(CSS_CLASS_SELECTOR)) defined.add(name);
  }

  return defined;
}

/**
 * Whether the project styles itself with Tailwind — which decides whether a
 * missing CDN script is a broken page or simply a project that does not use it.
 *
 * A class name is only Tailwind's if the project does not define it. The
 * pattern is a cross-product of prefixes and scale words, so `flex-center` and
 * `text-center` match it — and a project whose own stylesheet defines them was
 * reported as broken, with a repair hint telling the model to add the Tailwind
 * CDN build, whose Preflight reset would then undo the hand-written design.
 */
export function usesTailwind(files: ProjectFile[]): boolean {
  const defined = definedClasses(files);

  return files.some((file) => {
    if (TAILWIND_DIRECTIVE.test(file.content)) return true;
    if (TAILWIND_CONFIG.test(file.path)) return true;
    return classValues(file.content).some((value) => value
      .split(/\s+/)
      .some((name) => name.length > 0 && !defined.has(name) && TAILWIND_UTILITY.test(name)));
  });
}

interface Manifest {
  /** `dependencies` and `devDependencies` together, as the runtime reads them. */
  declared: Record<string, string>;
  /** The file did not parse. */
  broken: boolean;
  present: boolean;
}

function readManifest(files: ProjectFile[]): Manifest {
  const file = files.find((item) => item.path === 'package.json');
  if (!file) return { declared: {}, broken: false, present: false };

  try {
    const parsed: unknown = JSON.parse(file.content);
    if (!parsed || typeof parsed !== 'object') return { declared: {}, broken: true, present: true };

    const { dependencies, devDependencies } = parsed as Record<string, unknown>;
    const declared: Record<string, string> = {};
    // Both groups: there is no build step, so the distinction means nothing
    // here — and a package declared in either is one the model believes it has.
    for (const group of [dependencies, devDependencies]) {
      if (!group || typeof group !== 'object') continue;
      for (const [name, version] of Object.entries(group)) {
        declared[name] = typeof version === 'string' ? version : '';
      }
    }
    return { declared, broken: false, present: true };
  } catch {
    return { declared: {}, broken: true, present: true };
  }
}

/** Paths that cannot become documents, or cannot be reached once they are. */
function checkPaths(files: ProjectFile[], errors: ProjectProblem[], warnings: ProjectProblem[]): void {
  const seen = new Set<string>();

  for (const { path, content } of files) {
    if (seen.has(path)) {
      errors.push(problem(path, 'This file was written twice.', `Write "${path}" exactly once.`));
    }
    seen.add(path);

    if (!path.trim() || path.startsWith('/') || path.includes('\\') || /(?:^|\/)\.\.(?:\/|$)/.test(path)) {
      errors.push(problem(path, 'This path is not project-relative.', `Use a project-relative path with forward slashes instead of "${path}" — no leading slash and no "..".`));
    }
    if (path.startsWith('node_modules/') || path.startsWith('.git/')) {
      errors.push(problem(path, 'This folder is not part of a project here.', `Do not write "${path}": there is no install step, so node_modules and .git mean nothing.`));
    }
    if (BINARY.test(path)) {
      errors.push(problem(path, 'Binary files cannot exist in this editor.', `Delete "${path}" and draw it with inline SVG, CSS or an emoji instead — binary assets cannot be stored or imported here.`));
    }
    if (content.trim() === '') {
      warnings.push(problem(path, 'This file is empty.', `Write the full contents of "${path}" or leave it out altogether.`));
    }
    if (SCRIPT.test(path) && lineCount(content) > MAX_LINES) {
      warnings.push(problem(path, `${lineCount(content)} lines — long enough to be hard to read.`, `Split "${path}" into smaller files, each under ${MAX_LINES} lines.`));
    }
  }
}

/**
 * Sucrase failures: code that cannot even be parsed, let alone run.
 *
 * Two passes, because the runtime treats the two sets of files differently.
 * `transpileWorkspace` compiles `.ts`, `.tsx` and `.jsx`, so its failures are
 * the parse errors for those; `.js`, `.mjs` and `.cjs` are published exactly as
 * written and are parsed separately — otherwise a `.js` file full of JSX passes
 * every check here and then throws in the browser.
 */
async function checkSyntax(files: ProjectFile[], errors: ProjectProblem[]): Promise<void> {
  const { failures } = await transpileWorkspace(files);
  for (const failure of failures) {
    errors.push(problem(
      failure.path,
      `Does not parse: ${failure.message}`,
      `Rewrite "${failure.path}" so it parses. The compiler reported: ${failure.message}`,
    ));
  }

  for (const failure of await parsePlainScripts(files)) {
    if (failure.jsx) {
      const renamed = failure.path.replace(/\.[cm]?js$/i, '.jsx');
      errors.push(problem(
        failure.path,
        'JSX in a .js file: only .jsx, .ts and .tsx are compiled, so this is served as written and the browser cannot read it.',
        `Rename "${failure.path}" to "${renamed}" (and any import that names it by extension) — JSX is only compiled for .jsx, .ts and .tsx.`,
      ));
      continue;
    }
    errors.push(problem(
      failure.path,
      `Does not parse: ${failure.message}`,
      `Rewrite "${failure.path}" so it parses. The compiler reported: ${failure.message}`,
    ));
  }
}

/**
 * Every relative import resolves to a file that was actually generated.
 *
 * Resolution is the preview's, not an approximation of it: path aliases are
 * applied first (`@/App` is the project's own file, not a package), specifiers
 * are resolved against the importing file's folder, and `buildAliases` supplies
 * the extensionless and `folder/index` spellings a bundler would accept.
 */
function checkImports(files: ProjectFile[], errors: ProjectProblem[]): void {
  const aliases = readPathAliases(files);
  const scripts: Record<string, string> = {};
  for (const file of files) {
    if (SCRIPT.test(file.path)) scripts[file.path] = applyPathAliases(file.content, aliases);
  }

  const spellings = buildAliases(scripts);
  // The preview's own lookup, so `import logo from '/logo.svg'` finding
  // `public/logo.svg` is resolved here exactly as it is at run time. Mirroring
  // the rule instead would let the two drift, and reporting a resolvable
  // import as missing spends the repair round on a project that already works.
  const lookup = lookupIn(files);
  const known = (path: string): boolean => lookup(path) !== undefined;

  for (const [path, source] of Object.entries(scripts)) {
    for (const specifier of collectDependencies(source, path)) {
      const { path: target } = splitQuery(specifier);
      if (!target) continue;

      if (BINARY.test(target)) {
        errors.push(problem(path, `Imports a binary asset: ${target}`, `Remove the import of "${target}" from "${path}" — only .ts .tsx .js .jsx .css .json and .svg can be imported here.`));
        continue;
      }
      if (HAS_EXTENSION.test(target) && !IMPORTABLE.test(target)) {
        errors.push(problem(path, `Imports a file type the runtime cannot load: ${target}`, `Remove the import of "${target}" from "${path}" — only .ts .tsx .js .jsx .css .json and .svg can be imported here.`));
        continue;
      }

      const resolved = target in scripts
        || target in spellings
        || known(target)
        || (!HAS_EXTENSION.test(target) && known(`${target}.json`));

      if (!resolved) {
        errors.push(problem(path, `Imports "${target}", which no file in the project provides.`, `Either add the missing file "${target}" or change the import in "${path}" to a file that exists.`));
      }
    }
  }
}

/** `document.getElementById('root')` and `querySelector('#root')`. */
const ELEMENT_LOOKUP = /\bgetElementById\s*\(\s*(['"`])([^'"`]+)\1|\bquerySelector(?:All)?\s*\(\s*(['"`])#([A-Za-z_][\w-]*)\3/g;

/** A literal id, not `${something}` and not a selector with more to it. */
const PLAIN_ID = /^[A-Za-z_][\w-]*$/;

/** Which ids the project's own scripts expect the page to contain, and where. */
function mountPoints(files: ProjectFile[]): Map<string, string> {
  const wanted = new Map<string, string>();

  for (const file of files) {
    if (!SCRIPT.test(file.path)) continue;
    for (const [, , byId, , bySelector] of file.content.matchAll(ELEMENT_LOOKUP)) {
      const id = byId ?? bySelector;
      // An interpolated lookup names nothing this check can verify, and a
      // guess about it would be the false positive this replaced.
      if (id && PLAIN_ID.test(id) && !wanted.has(id)) wanted.set(id, file.path);
    }
  }

  return wanted;
}

/** The project has somewhere to start, and its page mounts something. */
function checkEntry(files: ProjectFile[], errors: ProjectProblem[], warnings: ProjectProblem[]): void {
  if (detectProjectEntry(files) === null) {
    errors.push(problem('', 'Nothing to run: there is no index.html and no src/main entry.', 'Add an "index.html" with <div id="root"></div> and <script type="module" src="/src/main.tsx"></script>, and a "src/main.tsx" that mounts the app.'));
  }

  const page = files.find((file) => file.path === PAGE);
  if (!page) {
    warnings.push(problem('', 'There is no index.html.', 'Add an "index.html" at the project root with <div id="root"></div> and a module script pointing at the entry.'));
    return;
  }

  /**
   * The mount point the code actually asks for, rather than `root` by rule.
   *
   * `buildPageDocument` runs a project's `index.html` as written — the
   * hard-coded `<div id="root">` belongs to the *generated* page used when the
   * entry is a script — so a canvas game that looks up `#game`, or an app that
   * mounts into `#app`, runs perfectly well. Demanding `root` regardless
   * reported a working project as broken and spent the repair round on it.
   */
  const wanted = mountPoints(files);
  for (const [id, path] of wanted) {
    if (new RegExp(`\\bid\\s*=\\s*["']${id}["']`).test(page.content)) continue;
    errors.push(problem(
      PAGE,
      `The page has no <div id="${id}">, which "${path}" looks for.`,
      `Add <div id="${id}"></div> to the <body> of "index.html", or change "${path}" to look up an element the page contains.`,
    ));
  }

  if (wanted.size === 0 && projectTypeInfo(files).usesJsx && !/\bid\s*=\s*["']root["']/.test(page.content)) {
    // A React project that never looks up an element may still mount into
    // `document.body`, so this is only a warning.
    warnings.push(problem(PAGE, 'The page has no <div id="root"> and nothing looks up a mount point.', 'Add <div id="root"></div> to the <body> of "index.html" and render the app into it.'));
  }

  if (!hasModuleScript(page.content, PAGE)) {
    errors.push(problem(PAGE, 'The page loads none of the project\'s own modules.', 'Add <script type="module" src="/src/main.tsx"></script> to "index.html".'));
  } else if (!hasModuleScript(page.content, PAGE, files)) {
    // The tag is there, but its `src` names a file the generation never wrote.
    errors.push(problem(PAGE, 'The page\'s module script points at a file that does not exist.', 'Make the <script type="module"> in "index.html" point at a file the project actually contains, such as "/src/main.tsx".'));
  }
}

/** package.json parses, and its dependencies are exactly what the code imports. */
function checkDependencies(files: ProjectFile[], errors: ProjectProblem[], warnings: ProjectProblem[]): void {
  const manifest = readManifest(files);
  // The preview's own reading of what the code imports, aliases resolved.
  const info = projectTypeInfo(files);
  const importedNames = new Set(info.packages.map((item) => item.name));
  // JSX compiles to an import of `react/jsx-runtime`, so a file with JSX in it
  // depends on React whether or not it ever writes the word.
  if (info.usesJsx) importedNames.add('react');

  if (manifest.broken) {
    errors.push(problem('package.json', 'package.json is not valid JSON.', 'Rewrite "package.json" as valid JSON with a "dependencies" object.'));
  } else if (!manifest.present) {
    const names = [...importedNames];
    const text = `Add a "package.json" listing exactly the packages the code imports${names.length > 0 ? `: ${names.join(', ')}` : ''}.`;
    // With no imports there is no version to pin, so the file is only missing
    // paperwork; with imports, the runtime has nothing to resolve them at.
    if (names.length > 0) {
      errors.push(problem('', 'There is no package.json, so imported packages have no version.', text));
    } else {
      warnings.push(problem('', 'There is no package.json.', text));
    }
  }

  for (const name of importedNames) {
    if (NODE_BUILTINS.has(name)) continue; // Reported as a Node import.
    if (manifest.present && !manifest.broken && !(name in manifest.declared)) {
      errors.push(problem('package.json', `"${name}" is imported but not in dependencies.`, `Add "${name}" to "dependencies" in "package.json" — every imported package must be listed with a version.`));
    }
  }

  for (const name of Object.keys(manifest.declared)) {
    if (importedNames.has(name)) continue;
    if (BUILD_ONLY.test(name)) {
      errors.push(problem('package.json', `"${name}" is a build-time package, and there is no build step here.`, `Remove "${name}" from "package.json": packages are loaded from a CDN at run time, so a build tool is never installed or run.`));
    } else {
      warnings.push(problem('package.json', `"${name}" is listed but never imported.`, `Remove "${name}" from "package.json": nothing in the project imports it.`));
    }
  }
}

/** Tailwind works here from the CDN and nowhere else. */
function checkTailwind(files: ProjectFile[], errors: ProjectProblem[], warnings: ProjectProblem[]): void {
  const page = files.find((file) => file.path === PAGE);
  const hasCdn = page?.content.includes('cdn.tailwindcss.com') ?? false;

  for (const file of files) {
    if (TAILWIND_DIRECTIVE.test(file.content)) {
      errors.push(problem(file.path, '@tailwind and @apply do nothing: there is no PostCSS step.', `Remove the @tailwind and @apply rules from "${file.path}" and use Tailwind utility classes in the markup, with <script src="${TAILWIND_CDN}"></script> in index.html.`));
    }
    if (TAILWIND_CONFIG.test(file.path)) {
      warnings.push(problem(file.path, 'Nothing reads this file: Tailwind here is the CDN build.', `Delete "${file.path}" — the CDN build is configured in index.html, not by a config file.`));
    }
  }

  if (usesTailwind(files) && !hasCdn) {
    errors.push(problem(page ? PAGE : '', 'Tailwind classes are used, but the page never loads Tailwind.', `Add <script src="${TAILWIND_CDN}"></script> to the <head> of "index.html" — Tailwind has no build step here, so nothing else loads it.`));
  }
}

/** Everything that assumes a server, a bundler or a browser URL bar. */
function checkRuntimeAssumptions(files: ProjectFile[], errors: ProjectProblem[], warnings: ProjectProblem[]): void {
  for (const file of files) {
    if (!SCRIPT.test(file.path)) continue;
    const { path, content } = file;

    if (/\b(?:BrowserRouter|HashRouter)\b/.test(content)) {
      errors.push(problem(path, 'BrowserRouter needs a URL bar the sandbox does not have.', `Use MemoryRouter from react-router in "${path}" instead of BrowserRouter or HashRouter.`));
    }
    if (/\bprocess\s*\.\s*env\b/.test(content)) {
      errors.push(problem(path, 'There is no Node, so process.env is undefined.', `Remove process.env from "${path}" — only import.meta.env.MODE exists here.`));
    }
    if (/\b__dirname\b|\b__filename\b|\bmodule\s*\.\s*exports\b|\brequire\s*\(/.test(content)) {
      errors.push(problem(path, 'CommonJS and Node globals do not exist in the sandbox.', `Rewrite "${path}" as an ES module: no require(), no module.exports, no __dirname.`));
    }
    if (/(['"])node:[^'"]+\1/.test(content)) {
      errors.push(problem(path, 'Node built-ins cannot be imported in a browser.', `Remove the "node:" imports from "${path}" — the project runs in a browser tab with no filesystem.`));
    }
    if (/\/\/\s*\.\.\.|\.\.\.\s*rest of|TODO:\s*implement/i.test(content)) {
      warnings.push(problem(path, 'This file looks like it was left unfinished.', `Write "${path}" in full — no placeholders, no "rest of the code" comments.`));
    }
  }

  for (const item of projectTypeInfo(files).packages) {
    if (!NODE_BUILTINS.has(item.name)) continue;
    errors.push(problem('', `"${item.name}" is a Node module, which a browser cannot load.`, `Remove the "${item.name}" import: the project runs in a browser tab, with no filesystem, no process and no server.`));
  }
}

export async function validateProject(files: ProjectFile[]): Promise<ValidationReport> {
  const errors: ProjectProblem[] = [];
  const warnings: ProjectProblem[] = [];

  if (files.length === 0) {
    errors.push(problem('', 'The model returned no files.', 'Write the project: every file it needs, complete.'));
    return { errors, warnings };
  }

  checkPaths(files, errors, warnings);
  await checkSyntax(files, errors);
  checkImports(files, errors);
  checkEntry(files, errors, warnings);
  checkDependencies(files, errors, warnings);
  checkTailwind(files, errors, warnings);
  checkRuntimeAssumptions(files, errors, warnings);

  return { errors, warnings };
}

/**
 * The problems as instructions for the repair round.
 *
 * Errors only, deduplicated: a free model reads a short list far better than a
 * long one, and a warning is not worth a second rate-limited request.
 */
export function repairHints(report: ValidationReport): string[] {
  const hints = report.errors.map((item) => (item.path ? `${item.path}: ${item.hint}` : item.hint));
  return [...new Set(hints)];
}

export function hasBlockingProblems(report: ValidationReport): boolean {
  return report.errors.length > 0;
}
