import ts from 'typescript';
import { buildPreviewDocument, type PreviewFile } from './buildPreviewDocument';
import { transpileWorkspace } from '../transpile/transpile';
import { detectProjectEntry } from '../projectEntry/projectEntry';
import { IMPORT_META_ENV_BINDING, VITE_ENV, VITE_ENV_GLOBAL } from '../viteShim/viteShim';

/*
 * The end-to-end guard for "one Run for the whole app".
 *
 * A project shaped like `npm create vite@latest -- --template react-ts` (plus
 * the things real apps add: a CSS module, JSON, a barrel, a lazy route, a
 * `.js`-spelled TS import) goes through the same two steps the pane runs —
 * transpileWorkspace, then buildPreviewDocument — and the document is then
 * link-checked the way a browser would resolve it:
 *
 * - the import map is the one the document's own inlined loader builds,
 *   executed against a stub DOM (nothing is fetched or evaluated);
 * - every import in every module that map serves — workspace modules and
 *   generated asset modules alike — is found with TypeScript's scanner, an
 *   independent parser rather than the regexes the builder itself uses;
 * - each specifier must resolve through the map by import-map rules (an
 *   exact key, or the longest `prefix/` key). A relative one can never
 *   resolve from a data: module, so it fails too.
 */

const META = ['import', 'meta'].join('.');

const VITE_PROJECT: PreviewFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'vite-project',
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'tsc -b && vite build' },
      dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0' },
      devDependencies: {
        '@vitejs/plugin-react': '^4.6.0',
        typescript: '~5.8.3',
        vite: '^7.0.0',
      },
    }, null, 2),
  },
  {
    path: 'index.html',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  },
  {
    path: 'vite.config.ts',
    content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
  },
  { path: 'tsconfig.json', content: '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }' },
  { path: 'public/vite.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>' },
  { path: 'src/vite-env.d.ts', content: '/// <reference types="vite/client" />\n' },
  {
    path: 'src/main.tsx',
    content: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (${META}.env.DEV) console.info('mode', ${META}.env.MODE)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
  },
  {
    path: 'src/App.tsx',
    content: `import { lazy, Suspense, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import styles from './App.module.css'
import { Counter } from './components/Counter'
import items from './data/items.json'
import type { Item } from './types'
import { formatCount } from './utils/format.js'

const Lazy = lazy(() => import('./components/Lazy'))

function App() {
  const [open, setOpen] = useState(false)
  const list: Item[] = items

  return (
    <>
      <div className={styles.logoRow}>
        <a href="https://vite.dev" target="_blank"><img src={viteLogo} className="logo" alt="Vite logo" /></a>
        <a href="https://react.dev" target="_blank"><img src={reactLogo} className="logo react" alt="React logo" /></a>
      </div>
      <h1>Vite + React</h1>
      <Counter label={formatCount(list.length)} />
      <button onClick={() => setOpen(true)}>More</button>
      {open && <Suspense fallback={null}><Lazy /></Suspense>}
      {${META}.hot && <p>hot</p>}
    </>
  )
}

export default App
`,
  },
  {
    path: 'src/components/Counter.tsx',
    content: `import { useCounter } from '../hooks/useCounter'
import cls from './Counter.module.css'

interface CounterProps { label: string }

export function Counter({ label }: CounterProps) {
  const { count, increment } = useCounter()
  return <button className={cls.counter} onClick={increment}>{label}: {count}</button>
}
`,
  },
  { path: 'src/components/index.ts', content: "export * from './Counter'\nexport { default as Lazy } from './Lazy'\n" },
  {
    path: 'src/components/Lazy.jsx',
    content: `import { Counter } from '.'
import { formatCount } from '../utils/format'

export default function Lazy() {
  return <section><Counter label={formatCount(2)} /></section>
}
`,
  },
  {
    path: 'src/hooks/useCounter.ts',
    content: `import { useCallback, useState } from 'react'

export function useCounter(initial = 0) {
  const [count, setCount] = useState<number>(initial)
  const increment = useCallback(() => setCount((c) => c + 1), [])
  return { count, increment }
}
`,
  },
  { path: 'src/utils/format.ts', content: 'export const formatCount = (n: number): string => `count is ${n}`\n' },
  { path: 'src/types.ts', content: 'export interface Item { id: number; name: string }\n' },
  { path: 'src/data/items.json', content: '[{ "id": 1, "name": "one" }, { "id": 2, "name": "two" }]' },
  { path: 'src/index.css', content: ':root { font-family: system-ui; }\nbody { margin: 0; }\n' },
  { path: 'src/App.css', content: '.logo { height: 6em; }\n.logo.react:hover { filter: drop-shadow(0 0 2em #61dafbaa); }\n' },
  { path: 'src/App.module.css', content: '.logo-row { display: flex; gap: 1rem; }\n' },
  { path: 'src/components/Counter.module.css', content: '.counter { padding: 0.6em 1.2em; }\n' },
  { path: 'src/assets/react.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>' },
  { path: 'README.md', content: '# React + TypeScript + Vite\n' },
];

interface LoadedDocument {
  page: Document;
  /** The import map exactly as the inlined loader builds it. */
  imports: Record<string, string>;
  /** data: URL -> workspace path, as the loader registers them for the console. */
  moduleNames: Record<string, string>;
  entries: string[];
  mount: boolean;
  /** Whatever the loader put on `window`, such as the Vite env. */
  frameWindow: Record<string, unknown>;
}

/**
 * Runs the document's own loader script against a stub DOM, up to the point
 * where it would start importing: `readyState` is `loading` and the
 * DOMContentLoaded listener is never called, so nothing is fetched.
 */
function loadDocument(html: string): LoadedDocument {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const loader = [...page.querySelectorAll('script:not([type])')]
    .map((node) => node.textContent ?? '')
    .find((text) => text.includes("map.type = 'importmap'"));
  if (!loader) throw new Error('The document has no module loader.');

  const appended: Array<{ type: string; textContent: string }> = [];
  const frameDocument = {
    readyState: 'loading',
    addEventListener: () => undefined,
    getElementById: (id: string) => page.getElementById(id),
    createElement: () => ({ type: '', textContent: '' }),
    head: { appendChild: (node: { type: string; textContent: string }) => appended.push(node) },
  };
  const frameWindow: Record<string, unknown> = { __spaceModuleNames: {}, addEventListener: () => undefined };

  new Function('document', 'window', loader)(frameDocument, frameWindow);

  const map = appended.find((node) => node.type === 'importmap');
  if (!map) throw new Error('The loader added no import map.');

  const workspace = page.getElementById('__workspace__') as HTMLElement;
  return {
    page,
    imports: (JSON.parse(map.textContent) as { imports: Record<string, string> }).imports,
    moduleNames: frameWindow.__spaceModuleNames as Record<string, string>,
    entries: workspace.dataset.entries
      ? (JSON.parse(workspace.dataset.entries) as string[])
      : [workspace.dataset.entry ?? ''],
    mount: workspace.dataset.mount === 'default',
    frameWindow,
  };
}

/** Import-map resolution: an exact key, else the longest matching `prefix/` key. */
function resolveSpecifier(specifier: string, imports: Record<string, string>): string | null {
  if (specifier in imports) return imports[specifier];
  const prefix = Object.keys(imports)
    .filter((key) => key.endsWith('/') && specifier.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? imports[prefix] + specifier.slice(prefix.length) : null;
}

const DATA_MODULE = 'data:text/javascript;charset=utf-8,';

function sourceOf(url: string): string | null {
  return url.startsWith(DATA_MODULE) ? decodeURIComponent(url.slice(DATA_MODULE.length)) : null;
}

/** Every static, re-export and dynamic import in a module, by TypeScript's scanner. */
function importsOf(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((file) => file.fileName);
}

interface LinkReport {
  /** `module -> specifier` for each import that resolves to nothing. */
  broken: string[];
  /** Workspace paths reachable from the entries, following imports. */
  reachable: Set<string>;
}

/**
 * Walks every module the map serves and checks each of its imports, then
 * walks the graph from the entries to see what a run would actually load.
 */
function linkCheck(loaded: LoadedDocument): LinkReport {
  const { imports, moduleNames, entries, mount } = loaded;
  const broken: string[] = [];

  // Once per module: an alias is a second key for the same URL.
  for (const url of new Set(Object.values(imports))) {
    const source = sourceOf(url);
    if (source === null) continue;
    for (const specifier of importsOf(source)) {
      if (!resolveSpecifier(specifier, imports)) broken.push(`${moduleNames[url]} -> ${specifier}`);
    }
  }

  // The loader's own imports: each entry, and React when it mounts one.
  const roots = entries.map((entry) => `workspace:${entry}`);
  if (mount) roots.push('react', 'react-dom/client');
  for (const root of roots) {
    if (!resolveSpecifier(root, imports)) broken.push(`loader -> ${root}`);
  }

  const reachable = new Set<string>();
  const queue = roots.map((root) => resolveSpecifier(root, imports)).filter((url): url is string => Boolean(url));
  while (queue.length > 0) {
    const url = queue.shift() as string;
    const source = sourceOf(url);
    const name = moduleNames[url];
    if (source === null || name === undefined || reachable.has(name)) continue;
    reachable.add(name);
    for (const specifier of importsOf(source)) {
      const target = resolveSpecifier(specifier, imports);
      if (target) queue.push(target);
    }
  }

  return { broken, reachable };
}

async function build(files: PreviewFile[], entry: string) {
  const { files: compiled, failures } = await transpileWorkspace(files);
  const html = buildPreviewDocument({ files: compiled, entry });
  return { html, failures, loaded: loadDocument(html) };
}

/** What a full run of the app must load: every file main.tsx leads to. */
const APP_GRAPH = [
  'src/main.js',
  'src/index.css',
  'src/App.js',
  'src/assets/react.svg',
  'vite.svg',
  'src/App.css',
  'src/App.module.css',
  'src/components/Counter.js',
  'src/components/Counter.module.css',
  'src/hooks/useCounter.js',
  'src/data/items.json',
  'src/utils/format.js',
  'src/components/Lazy.js',
  'src/components/index.js',
];

describe('a Vite + React project, run whole', () => {
  test('is detected as a Vite project', () => {
    expect(detectProjectEntry(VITE_PROJECT)).toBe('index.html');
  });

  test.each([
    ['index.html', APP_GRAPH],
    ['src/main.tsx', APP_GRAPH],
    ['src/App.tsx', APP_GRAPH.filter((path) => path !== 'src/main.js' && path !== 'src/index.css')],
    ['src/components/Counter.tsx', ['src/components/Counter.js', 'src/hooks/useCounter.js', 'src/components/Counter.module.css']],
  ])('every import in every module resolves, running from %s', async (entry, graph) => {
    const { failures, loaded } = await build(VITE_PROJECT, entry);

    expect(failures).toEqual([]);
    const { broken, reachable } = linkCheck(loaded);
    expect(broken).toEqual([]);
    for (const path of graph) expect(reachable).toContain(path);
  });

  test('no module reaches the browser with an import the map cannot answer', async () => {
    const { loaded } = await build(VITE_PROJECT, 'index.html');

    const modules = Object.entries(loaded.imports)
      .map(([key, url]) => [key, sourceOf(url)] as const)
      .filter((pair): pair is readonly [string, string] => pair[1] !== null);

    // Sanity: the walk above really saw the whole project, assets included.
    expect(modules.length).toBeGreaterThanOrEqual(APP_GRAPH.length);
    for (const [key, source] of modules) {
      for (const specifier of importsOf(source)) {
        // A data: module resolves `./x` and `/x` against its own URL: never valid.
        expect(`${key} -> ${specifier}`).not.toMatch(/ -> [./]/);
      }
      expect(source).not.toMatch(/\bimport\s*\.\s*meta\s*\.\s*(?:env|hot)\b/);
    }
  });

  test('no generated asset module is an error in disguise', async () => {
    const { loaded } = await build(VITE_PROJECT, 'index.html');

    for (const path of APP_GRAPH.filter((name) => !name.endsWith('.js'))) {
      const source = sourceOf(loaded.imports[`workspace:${path}`]);
      expect(source, path).not.toBeNull();
      expect(source, path).not.toContain('throw new Error');
    }
  });

  test('the page keeps its markup, drops its module script, and runs the bridge first', async () => {
    const { loaded } = await build(VITE_PROJECT, 'index.html');
    const { page, entries } = loaded;

    expect(entries).toEqual(['src/main.js']);
    expect(page.getElementById('root')).not.toBeNull();
    // Replaced where it stood by a native module script that imports the
    // resolved module, so it runs before DOMContentLoaded as the original would.
    const modules = [...page.querySelectorAll('script[type="module"]')];
    expect(modules.map((node) => node.textContent)).toEqual(['import "workspace:src/main.js";']);
    expect(modules[0].compareDocumentPosition(page.getElementById('root') as Node))
      .toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(resolveSpecifier('workspace:src/main.js', loaded.imports)).not.toBeNull();
    expect(page.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/vite.svg');
    expect(page.querySelector('script')?.textContent).toContain('__space_preview__');
    expect(page.title).toBe('Vite + React + TS');
  });

  test('packages come from the CDN, with one React at the declared version', async () => {
    const { loaded } = await build(VITE_PROJECT, 'index.html');
    const { imports } = loaded;

    for (const specifier of ['react', 'react/jsx-runtime', 'react-dom/client']) {
      expect(imports[specifier], specifier).toMatch(/^https:\/\/esm\.sh\//);
    }
    const version = encodeURIComponent('^19.1.0');
    expect(imports.react).toBe(`https://esm.sh/react@${version}`);
    expect(imports['react-dom/client']).toBe(`https://esm.sh/react-dom@${version}/client?deps=react@${version}`);
    for (const [specifier, url] of Object.entries(imports)) {
      if (!specifier.startsWith('workspace:')) expect(url, specifier).toMatch(/^https:\/\/esm\.sh\//);
    }
  });

  test('the loader defines the Vite env the shimmed modules read', async () => {
    const { loaded } = await build(VITE_PROJECT, 'index.html');
    const env = loaded.frameWindow[VITE_ENV_GLOBAL];

    expect(env).toEqual(VITE_ENV);
    expect(Object.isFrozen(env)).toBe(true);
    expect(sourceOf(loaded.imports['workspace:src/main.js'])).toContain(`Object.assign({}, globalThis.${VITE_ENV_GLOBAL})`);
    expect(sourceOf(loaded.imports['workspace:src/main.js'])).toContain(`${IMPORT_META_ENV_BINDING}.DEV`);
  });

  test('a component entry is mounted, and React resolves for the mount', async () => {
    const { loaded } = await build(VITE_PROJECT, 'src/App.tsx');
    expect(loaded.mount).toBe(true);
    expect(linkCheck(loaded).broken).toEqual([]);
  });
});

describe('the link check itself', () => {
  // A guard that cannot fail guards nothing: each of these must be caught.
  test.each([
    // Bindings are used: TypeScript elides an import whose names never are.
    ['a missing extensionless module', "import { x } from './nope';\nconsole.log(x);", './nope'],
    ['a folder with no index', "import { x } from './empty';\nconsole.log(x);", './empty'],
    ['a lazy import of nothing', "const later = () => import('./later');", './later'],
    ['a workspace path no module has', "export { x } from 'workspace:src/ghost.js';", 'workspace:src/ghost.js'],
  ])('reports %s', async (_label, source, specifier) => {
    const { loaded } = await build([
      { path: 'src/main.ts', content: source },
      { path: 'src/empty/readme.md', content: '' },
    ], 'src/main.ts');

    const { broken } = linkCheck(loaded);
    expect(broken, JSON.stringify(broken)).toHaveLength(1);
    expect(broken[0]).toBe(`src/main.js -> workspace:src/${specifier.replace(/^(\.\/|workspace:src\/)/, '')}`);
  });

  test('reports a page module script naming a missing file', async () => {
    const { loaded } = await build([
      { path: 'index.html', content: '<script type="module" src="/src/missing.tsx"></script>' },
    ], 'index.html');

    expect(linkCheck(loaded).broken).toEqual(['loader -> workspace:src/missing.js']);
  });
});

describe('module identity and resolution, as the browser links them', () => {
  test('two files with identical text are two modules, each named by its path', async () => {
    const counter = 'export let n = 0; export const inc = () => ++n;';
    const { loaded } = await build([
      { path: 'src/main.js', content: "import { inc as a } from './a/counter.js';\nimport { inc as b } from './b/counter.js';\na(); b();" },
      { path: 'src/a/counter.js', content: counter },
      { path: 'src/b/counter.js', content: counter },
    ], 'src/main.js');

    const a = loaded.imports['workspace:src/a/counter.js'];
    const b = loaded.imports['workspace:src/b/counter.js'];
    expect(a).not.toBe(b);
    expect(loaded.moduleNames[a]).toBe('src/a/counter.js');
    expect(loaded.moduleNames[b]).toBe('src/b/counter.js');
    expect(sourceOf(a)).toMatch(/\/\/# sourceURL=workspace:src\/a\/counter\.js$/);
  });

  test('Button.tsx beside Button.ts: the entry runs the component, ./Button reaches the .ts', async () => {
    const { loaded } = await build([
      { path: 'src/Button.tsx', content: 'export default function Button() { return <b />; }' },
      { path: 'src/Button.ts', content: "export const kind = 'ts-helper';" },
      { path: 'src/use.ts', content: "import { kind } from './Button';\nimport B from './Button.tsx';\nconsole.log(kind, B);" },
    ], 'src/Button.tsx');

    expect(loaded.entries).toEqual(['src/Button.tsx']);
    expect(loaded.mount).toBe(true);
    expect(sourceOf(loaded.imports['workspace:src/Button.tsx'])).toContain('function Button');
    expect(sourceOf(loaded.imports['workspace:src/Button'])).toContain('ts-helper');
    expect(linkCheck(loaded).broken).toEqual([]);
  });

  test('a named import from a JSON file has an export to link to', async () => {
    const { loaded } = await build([
      { path: 'package.json', content: '{"name":"x","version":"1.2.3"}' },
      { path: 'src/main.ts', content: "import { version } from '../package.json';\nconsole.log(version);" },
    ], 'src/main.ts');

    const json = sourceOf(loaded.imports['workspace:package.json']) ?? '';
    expect(json).toMatch(/export const \{[^}]*\bversion\b[^}]*\} = __spaceJson;/);
    expect(linkCheck(loaded).broken).toEqual([]);
  });

  test('an SVG ?react component and the React it imports both resolve', async () => {
    const { loaded } = await build([
      { path: 'src/main.tsx', content: "import Logo from './logo.svg?react';\nexport default function App() { return <Logo />; }" },
      { path: 'src/logo.svg', content: '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>' },
    ], 'src/main.tsx');

    const { broken, reachable } = linkCheck(loaded);
    expect(broken).toEqual([]);
    expect(reachable).toContain('src/logo.svg?react');
  });

  test('an @/ alias links to the workspace file, never to the CDN', async () => {
    const { loaded } = await build([
      { path: 'src/main.tsx', content: "import { Button } from '@/components/Button';\nconsole.log(Button);" },
      { path: 'src/components/Button.tsx', content: 'export const Button = 1;' },
    ], 'src/main.tsx');

    const { broken, reachable } = linkCheck(loaded);
    expect(broken).toEqual([]);
    expect(reachable).toContain('src/components/Button.js');
    expect(Object.keys(loaded.imports).some((key) => key.startsWith('@'))).toBe(false);
  });
});
