import { describe, expect, test } from 'vitest';
import type { ProjectFile } from '../streamJson/streamJson';
import { repairHints, usesTailwind, validateProject } from './validateProject';

/**
 * The shape of a good generation, as observed: a Tailwind CDN page, a
 * package.json listing exactly what is imported, and a React 19 entry.
 */
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bare App</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const PACKAGE_JSON = `{
  "name": "bare-app",
  "private": true,
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
`;

const MAIN = `import { createRoot } from 'react-dom/client';
import { App } from './App';

const host = document.getElementById('root');
if (host) createRoot(host).render(<App />);
`;

const APP = `export function App() {
  return <h1 className="text-3xl font-bold text-slate-900">Hello</h1>;
}
`;

function project(...overrides: ProjectFile[]): ProjectFile[] {
  const base: ProjectFile[] = [
    { path: 'index.html', content: INDEX_HTML },
    { path: 'package.json', content: PACKAGE_JSON },
    { path: 'src/main.tsx', content: MAIN },
    { path: 'src/App.tsx', content: APP },
  ];
  const byPath = new Map(base.map((file) => [file.path, file]));
  for (const file of overrides) byPath.set(file.path, file);
  return [...byPath.values()];
}

function without(path: string): ProjectFile[] {
  return project().filter((file) => file.path !== path);
}

function messages(problems: { path: string; message: string }[]): string {
  return problems.map((item) => `${item.path}|${item.message}`).join('\n');
}

describe('validateProject', () => {
  test('a good generation has nothing to report', async () => {
    const report = await validateProject(project());

    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  test('an empty answer is an error on its own', async () => {
    const report = await validateProject([]);

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].hint).toMatch(/write the project/i);
  });

  test('reports code that does not parse, naming the file', async () => {
    const report = await validateProject(project({ path: 'src/App.tsx', content: 'export function App( {' }));

    expect(messages(report.errors)).toMatch(/src\/App\.tsx\|Does not parse/);
  });

  test('catches a relative import that resolves to nothing', async () => {
    const source = `import { Card } from './components/Card';\nexport const App = () => <Card />;\n`;
    const report = await validateProject(project({ path: 'src/App.tsx', content: source }));

    expect(messages(report.errors)).toMatch(/src\/App\.tsx\|Imports "src\/components\/Card"/);
  });

  test('accepts the spellings the runtime accepts: extensionless, .js for .tsx, and a folder index', async () => {
    const report = await validateProject(project(
      { path: 'src/main.tsx', content: `import { App } from './App.js';\nimport { total } from './lib';\nconsole.info(App, total);\n` },
      { path: 'src/lib/index.ts', content: 'export const total = 1;\n' },
    ));

    expect(messages(report.errors)).toBe('');
  });

  test('resolves a path alias like the preview does, rather than calling it a package', async () => {
    const report = await validateProject(project(
      { path: 'src/main.tsx', content: `import { App } from '@/App';\nconsole.info(App);\n` },
    ));

    expect(report.errors).toEqual([]);
  });

  test('rejects an import of a binary asset and of an unloadable file type', async () => {
    const source = `import logo from './logo.png';\nimport data from './data.yaml';\nexport const App = () => <img src={logo} alt={data} />;\n`;
    const report = await validateProject(project({ path: 'src/App.tsx', content: source }));

    expect(messages(report.errors)).toMatch(/Imports a binary asset: src\/logo\.png/);
    expect(messages(report.errors)).toMatch(/cannot load: src\/data\.yaml/);
  });

  test('rejects a generated binary file outright', async () => {
    const report = await validateProject(project({ path: 'public/logo.png', content: 'iVBOR' }));

    expect(messages(report.errors)).toMatch(/public\/logo\.png\|Binary files cannot exist/);
  });

  test('rejects a path that escapes the project', async () => {
    const report = await validateProject(project({ path: '../secrets.ts', content: 'export const a = 1;\n' }));

    expect(messages(report.errors)).toMatch(/not project-relative/);
  });

  test('a project with no entry at all cannot run', async () => {
    const report = await validateProject([
      { path: 'package.json', content: '{}' },
      { path: 'README.md', content: '# hi' },
    ]);

    expect(messages(report.errors)).toMatch(/Nothing to run/);
  });

  test('a page without #root or a module script is an error each way', async () => {
    const report = await validateProject(project({
      path: 'index.html',
      content: '<!doctype html><html><body><div id="app"></div></body></html>',
    }));

    expect(messages(report.errors)).toMatch(/no <div id="root">/);
    expect(messages(report.errors)).toMatch(/loads none of the project's own modules/);
  });

  test('a module script pointing at a file that was never written is an error', async () => {
    const report = await validateProject(project({
      path: 'index.html',
      content: INDEX_HTML.replace('/src/main.tsx', '/src/entry.tsx'),
    }));

    expect(messages(report.errors)).toMatch(/points at a file that does not exist/);
  });

  test('an imported package missing from dependencies is an error', async () => {
    const report = await validateProject(project({
      path: 'src/App.tsx',
      content: `import { create } from 'zustand';\nexport const App = () => <p>{String(create)}</p>;\n`,
    }));

    expect(messages(report.errors)).toMatch(/"zustand" is imported but not in dependencies/);
  });

  test('JSX depends on React even when no file writes the import', async () => {
    const report = await validateProject(project({
      path: 'package.json',
      content: JSON.stringify({ dependencies: { 'react-dom': '^19.2.0' } }),
    }));

    expect(messages(report.errors)).toMatch(/"react" is imported but not in dependencies/);
    expect(messages(report.warnings)).not.toMatch(/"react" is listed but never imported/);
  });

  test('a tailwindcss dependency is an error, an unused one only a warning', async () => {
    const report = await validateProject(project({
      path: 'package.json',
      content: JSON.stringify({
        dependencies: { react: '^19.2.0', 'react-dom': '^19.2.0', tailwindcss: '^4.0.0', dayjs: '^1.11.0' },
      }),
    }));

    expect(messages(report.errors)).toMatch(/"tailwindcss" is a build-time package/);
    expect(messages(report.warnings)).toMatch(/"dayjs" is listed but never imported/);
  });

  test('a package.json that does not parse is an error', async () => {
    const report = await validateProject(project({ path: 'package.json', content: '{ "dependencies": }' }));

    expect(messages(report.errors)).toMatch(/package\.json is not valid JSON/);
  });

  test('no package.json is an error when packages are imported, a warning when none are', async () => {
    const withImports = await validateProject(without('package.json'));
    expect(messages(withImports.errors)).toMatch(/no package\.json/);

    const plain = await validateProject([
      { path: 'index.html', content: '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.js"></script></body></html>' },
      { path: 'src/main.js', content: 'document.title = "hi";\n' },
    ]);
    expect(plain.errors).toEqual([]);
    expect(messages(plain.warnings)).toMatch(/no package\.json/);
  });

  test('Tailwind classes without the CDN script is an error', async () => {
    const report = await validateProject(project({
      path: 'index.html',
      content: INDEX_HTML.replace('<script src="https://cdn.tailwindcss.com"></script>', ''),
    }));

    expect(messages(report.errors)).toMatch(/never loads Tailwind/);
  });

  test('@tailwind directives are an error and a config file a warning', async () => {
    const report = await validateProject(project(
      { path: 'src/index.css', content: '@tailwind base;\n@tailwind utilities;\n' },
      { path: 'tailwind.config.js', content: 'export default { content: [] };\n' },
    ));

    expect(messages(report.errors)).toMatch(/src\/index\.css\|@tailwind and @apply do nothing/);
    expect(messages(report.warnings)).toMatch(/tailwind\.config\.js\|Nothing reads this file/);
  });

  test('a hand-written class name is not mistaken for Tailwind', async () => {
    const files: ProjectFile[] = [
      { path: 'index.html', content: '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
      { path: 'src/main.jsx', content: `export const App = () => <div className="my-component card-body">hi</div>;\n` },
    ];

    expect(usesTailwind(files)).toBe(false);
    expect(messages((await validateProject(files)).errors)).not.toMatch(/Tailwind/);
  });

  test('BrowserRouter, process.env, require and node: imports are each an error', async () => {
    const source = `import { BrowserRouter } from 'react-router';
import fs from 'node:fs';
const mode = process.env.MODE;
const x = require('./x');
export const App = () => <BrowserRouter>{mode}{String(fs)}{String(x)}</BrowserRouter>;
`;
    const report = await validateProject(project({ path: 'src/App.tsx', content: source }));
    const text = messages(report.errors);

    expect(text).toMatch(/BrowserRouter needs a URL bar/);
    expect(text).toMatch(/process\.env is undefined/);
    expect(text).toMatch(/CommonJS and Node globals/);
    expect(text).toMatch(/Node built-ins cannot be imported/);
  });

  test('a bare Node built-in import is reported once, without asking for it in dependencies', async () => {
    const report = await validateProject(project({
      path: 'src/App.tsx',
      content: `import path from 'path';\nexport const App = () => <p>{path.join('a')}</p>;\n`,
    }));
    const text = messages(report.errors);

    expect(text).toMatch(/"path" is a Node module/);
    expect(text).not.toMatch(/"path" is imported but not in dependencies/);
  });

  test('a very long file and an empty one are warnings, not errors', async () => {
    const long = `${'const a = 1;\n'.repeat(200)}export default a;\n`;
    const report = await validateProject(project(
      { path: 'src/long.ts', content: long },
      { path: 'src/empty.ts', content: '' },
    ));

    expect(report.errors).toEqual([]);
    expect(messages(report.warnings)).toMatch(/src\/long\.ts\|20\d lines/);
    expect(messages(report.warnings)).toMatch(/src\/empty\.ts\|This file is empty/);
  });

  test('JSX in a .js file is an error, since nothing compiles that name', async () => {
    const files: ProjectFile[] = [
      { path: 'index.html', content: '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.js"></script></body></html>' },
      { path: 'src/main.js', content: `import { App } from './App';\ndocument.title = String(App);\n` },
      { path: 'src/App.js', content: `export const App = () => <div className="p-4">Hello</div>;\n` },
    ];
    const report = await validateProject(files);

    expect(messages(report.errors)).toMatch(/src\/App\.js\|JSX in a \.js file/);
    expect(repairHints(report).join('\n')).toMatch(/Rename "src\/App\.js" to "src\/App\.jsx"/);
  });

  test('a syntax error in a plain .js file is reported like any other', async () => {
    const files: ProjectFile[] = [
      { path: 'index.html', content: '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.js"></script></body></html>' },
      { path: 'src/main.js', content: 'const a = (;\n' },
    ];

    expect(messages((await validateProject(files)).errors)).toMatch(/src\/main\.js\|Does not parse/);
  });

  test('a page that mounts somewhere other than #root is not broken', async () => {
    const page = `<!doctype html><html><body><canvas id="game"></canvas><script type="module" src="/src/main.ts"></script></body></html>`;
    const main = `const canvas = document.getElementById('game') as HTMLCanvasElement | null;\nif (canvas) canvas.width = 320;\n`;
    const report = await validateProject([
      { path: 'index.html', content: page },
      { path: 'src/main.ts', content: main },
    ]);

    expect(report.errors).toEqual([]);
  });

  test('a mount point the page does not contain is an error, naming the file that wants it', async () => {
    const report = await validateProject(project(
      { path: 'index.html', content: INDEX_HTML.replace('<div id="root"></div>', '<div id="app"></div>') },
      { path: 'src/main.tsx', content: MAIN.replace(`'root'`, `'app'`) },
      { path: 'src/App.tsx', content: `export function App() {\n  const host = document.getElementById('missing');\n  return <p>{String(host)}</p>;\n}\n` },
    ));

    expect(messages(report.errors)).toEqual('index.html|The page has no <div id="missing">, which "src/App.tsx" looks for.');
  });

  test('a class the project\'s own stylesheet defines is not Tailwind', async () => {
    const files: ProjectFile[] = [
      { path: 'index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="/src/styles.css" /></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
      { path: 'src/main.jsx', content: `export const App = () => <div className="flex-center text-center">hi</div>;\n` },
      { path: 'src/styles.css', content: '.flex-center { display: flex; align-items: center; }\n.text-center { text-align: center; }\n' },
    ];

    expect(usesTailwind(files)).toBe(false);
    expect(messages((await validateProject(files)).errors)).not.toMatch(/Tailwind/);
  });

  test('a real utility class the project never defines is still Tailwind', async () => {
    const files: ProjectFile[] = [
      { path: 'index.html', content: '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
      { path: 'src/main.jsx', content: `export const App = () => <div className="flex-center bg-slate-900">hi</div>;\n` },
      { path: 'src/styles.css', content: '.flex-center { display: flex; }\n' },
    ];

    expect(usesTailwind(files)).toBe(true);
    expect(messages((await validateProject(files)).errors)).toMatch(/never loads Tailwind/);
  });

  test('an asset served from public/ resolves the way the preview resolves it', async () => {
    const report = await validateProject(project(
      { path: 'public/logo.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" />' },
      { path: 'src/App.tsx', content: `import logo from '/logo.svg';\nexport const App = () => <img src={logo} alt="" className="p-4" />;\n` },
    ));

    expect(report.errors).toEqual([]);
  });

  test('a file written twice is an error', async () => {
    const files = [...project(), { path: 'src/App.tsx', content: APP }];
    const report = await validateProject(files);

    expect(messages(report.errors)).toMatch(/written twice/);
  });
});

describe('repairHints', () => {
  test('gives the model one imperative line per distinct error, and nothing for warnings', async () => {
    const report = await validateProject(project({
      path: 'package.json',
      content: JSON.stringify({ dependencies: { react: '^19.2.0', 'react-dom': '^19.2.0', vite: '^8.0.0', dayjs: '^1.11.0' } }),
    }));
    const hints = repairHints(report);

    expect(hints).toEqual(['package.json: Remove "vite" from "package.json": packages are loaded from a CDN at run time, so a build tool is never installed or run.']);
  });

  test('deduplicates identical hints', () => {
    const duplicate = { path: 'a.ts', message: 'x', hint: 'Fix it.' };
    expect(repairHints({ errors: [duplicate, { ...duplicate }], warnings: [] })).toHaveLength(1);
  });
});
