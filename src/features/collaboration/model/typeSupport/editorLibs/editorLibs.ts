/**
 * What the editor's TypeScript service is told about a project: compiler
 * options, and the files it cannot see because they are not open — the rest
 * of the project, its packages' types, and declarations for what Vite (and
 * the preview) let a module import that TypeScript has no notion of.
 *
 * Plain data only, so every rule here is testable without Monaco.
 */

/** Monaco's own numbering, which is TypeScript's. Its typings only name some of them. */
const ScriptTarget = { ESNext: 99 } as const;
const ModuleKind = { ESNext: 99 } as const;
const ModuleResolution = { Bundler: 100 } as const;
const JsxEmit = { ReactJSX: 4 } as const;

/** Where a project's files live in the language service: `file:///p/<key>/src/App.tsx`. */
export function projectRoot(key: string): string {
  return `file:///p/${encodeURIComponent(key)}/`;
}

export function projectUri(key: string, path: string): string {
  return `${projectRoot(key)}${path}`;
}

export interface CompilerSettings {
  key: string;
  paths: Record<string, string[]>;
  strict: boolean;
}

/** The options Vite's React template compiles with, as far as an editor can use them. */
export function compilerOptions(settings: CompilerSettings): Record<string, unknown> {
  const hasPaths = Object.keys(settings.paths).length > 0;
  return {
    target: ScriptTarget.ESNext,
    module: ModuleKind.ESNext,
    moduleResolution: ModuleResolution.Bundler,
    jsx: JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    allowJs: true,
    checkJs: false,
    allowNonTsExtensions: true,
    allowImportingTsExtensions: true,
    // `./data.json` is typed by a generated `data.d.json.ts` next to it: the
    // language service would parse a real .json file as JavaScript.
    allowArbitraryExtensions: true,
    resolveJsonModule: false,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    isolatedModules: true,
    skipLibCheck: true,
    noEmit: true,
    strict: settings.strict,
    ...(hasPaths ? { baseUrl: projectRoot(settings.key), paths: settings.paths } : {}),
  };
}

/**
 * What a Vite project may import besides code, in the shapes the preview
 * gives them. The `*.module.css` pattern comes first: of two patterns that
 * both match, TypeScript takes the first declared.
 */
export const ASSET_DECLARATIONS = `
declare module '*.module.css' {
  const classes: { readonly [name: string]: string };
  export default classes;
}
declare module '*.css' {}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.svg?react' {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}
declare module '*?url' {
  const url: string;
  export default url;
}
declare module '*?raw' {
  const text: string;
  export default text;
}
declare module '*?inline' {
  const text: string;
  export default text;
}

interface ImportMetaEnv {
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
  readonly BASE_URL: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly hot?: unknown;
}
`;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'let', 'static', 'yield', 'await', 'implements',
  'interface', 'package', 'private', 'protected', 'public',
]);

/** The type TypeScript would infer for a JSON value, written out. */
export function jsonType(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0 || depth > 8) return 'unknown[]';
    const members = [...new Set(value.map((item) => jsonType(item, depth + 1)))];
    return members.length === 1 ? `${wrap(members[0])}[]` : `(${members.join(' | ')})[]`;
  }
  switch (typeof value) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'object': {
      if (depth > 8) return 'Record<string, unknown>';
      const fields = Object.entries(value as Record<string, unknown>).map(([key, item]) =>
        `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${jsonType(item, depth + 1)};`);
      return fields.length > 0 ? `{ ${fields.join(' ')} }` : 'Record<string, never>';
    }
    default: return 'unknown';
  }
}

function wrap(type: string): string {
  return /[|&]/.test(type) && !type.startsWith('{') ? `(${type})` : type;
}

/**
 * A `.d.json.ts` for a JSON file: its value as the default export, and each
 * top-level key that is a valid name as a named export — the shape the
 * preview's JSON modules have. Invalid JSON declares nothing but a default,
 * so a half-edited file does not bury every importer in errors.
 */
export function jsonDeclaration(content: string): string {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return 'declare const value: any;\nexport default value;\n';
  }

  const lines = [`declare const value: ${jsonType(value)};`, 'export default value;'];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (IDENTIFIER.test(key) && !RESERVED.has(key)) {
        lines.push(`export declare const ${key}: ${jsonType(item)};`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Stand-ins for packages whose types are still loading, or have none to be
 * found: typed as `any`, so the editor says nothing rather than "cannot find
 * module" about an import that runs fine. Replaced by the real types as soon
 * as they arrive — an ambient module outranks node_modules.
 */
export function untypedPackagesDeclaration(names: string[]): string {
  return names
    .map((name) => `declare module '${name}';\ndeclare module '${name}/*';`)
    .join('\n');
}

export interface ProjectSource {
  path: string;
  content: string;
}

const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const JSON_FILE = /\.json$/i;

/**
 * The project's other files, at the URIs relative imports between them
 * resolve to. The open file is left out: it is the editor's live model.
 */
export function projectLibs(key: string, files: ProjectSource[], openPath: string): Map<string, string> {
  const libs = new Map<string, string>();

  for (const file of files) {
    if (file.path === openPath) continue;
    if (SCRIPT.test(file.path)) {
      libs.set(projectUri(key, file.path), file.content);
    } else if (JSON_FILE.test(file.path)) {
      // `./data.json` -> `./data.d.json.ts`, which allowArbitraryExtensions finds.
      libs.set(projectUri(key, file.path.replace(/\.json$/i, '.d.json.ts')), jsonDeclaration(file.content));
    }
  }

  return libs;
}
