import { describe, expect, test } from 'vitest';
import { needsTranspile, transpiledPath, transpileWorkspace } from './transpile';

describe('needsTranspile', () => {
  test('only TypeScript and JSX sources need compiling', () => {
    expect(needsTranspile('a.ts')).toBe(true);
    expect(needsTranspile('a.tsx')).toBe(true);
    expect(needsTranspile('a.jsx')).toBe(true);
    expect(needsTranspile('a.js')).toBe(false);
    expect(needsTranspile('a.css')).toBe(false);
  });
});

describe('transpiledPath', () => {
  test('TypeScript is published as the .js its neighbours import', () => {
    expect(transpiledPath('util.ts')).toBe('util.js');
    expect(transpiledPath('App.tsx')).toBe('App.js');
    expect(transpiledPath('lib/math.ts')).toBe('lib/math.js');
  });

  test('JSX is published as .js too', () => {
    expect(transpiledPath('App.jsx')).toBe('App.js');
  });

  test('leaves anything else alone', () => {
    expect(transpiledPath('a.js')).toBe('a.js');
    expect(transpiledPath('page.html')).toBe('page.html');
  });
});

describe('transpileWorkspace', () => {
  test('passes a plain JS workspace straight through', async () => {
    const files = [{ path: 'main.js', content: 'console.log(1)' }];
    const result = await transpileWorkspace(files);

    expect(result.files).toBe(files);
    expect(result.failures).toEqual([]);
  });

  test('strips type annotations', async () => {
    const { files } = await transpileWorkspace([
      { path: 'main.ts', content: 'const n: number = 1;\nexport function f(a: string): string { return a; }' },
    ]);

    expect(files[0].path).toBe('main.js');
    expect(files[0].content).not.toContain(': number');
    expect(files[0].content).not.toContain(': string');
    expect(files[0].content).toContain('const n = 1');
  });

  test('erases an interface entirely', async () => {
    const { files } = await transpileWorkspace([
      { path: 'main.ts', content: 'interface User { id: string }\nexport const x = 1;' },
    ]);

    expect(files[0].content).not.toContain('interface');
    expect(files[0].content).toContain('export const x = 1');
  });

  test('drops an import that only carried types', async () => {
    const { files } = await transpileWorkspace([
      { path: 'main.ts', content: "import type { A } from './a.js';\nexport const x = 1;" },
    ]);

    expect(files[0].content).not.toContain('import type');
  });

  test('compiles TSX', async () => {
    const { files } = await transpileWorkspace([
      { path: 'App.tsx', content: 'export const App = () => <div className="x">hi</div>;' },
    ]);

    expect(files[0].path).toBe('App.js');
    expect(files[0].content).not.toContain('<div');
  });

  test('compiles JSX in a .jsx file, which the browser cannot parse', async () => {
    const { files, failures } = await transpileWorkspace([
      { path: 'App.jsx', content: 'export const App = () => <p>hi</p>;' },
    ]);

    expect(failures).toEqual([]);
    expect(files[0].path).toBe('App.js');
    expect(files[0].content).not.toContain('<p>');
  });

  test('needs no React in scope: JSX imports the automatic runtime itself', async () => {
    const { files } = await transpileWorkspace([
      { path: 'App.tsx', content: 'export default function App() { return <h1>hi</h1>; }' },
    ]);

    expect(files[0].content).toMatch(/from ['"]react\/jsx-runtime['"]/);
    // The production runtime: no `__self: this`, which is undefined in a module.
    expect(files[0].content).not.toContain('__self');
  });

  test('reports a syntax error against the file it came from', async () => {
    const { files, failures } = await transpileWorkspace([
      { path: 'broken.ts', content: 'const = : oops' },
    ]);

    expect(failures).toHaveLength(1);
    expect(failures[0].path).toBe('broken.ts');
    expect(failures[0].message).toMatch(/unexpected token/i);
    // Still published, so an importer fails on the missing export rather than
    // on a module that does not exist.
    expect(files[0].path).toBe('broken.js');
    expect(files[0].content).toBe('');
  });

  test('one broken file does not stop the others compiling', async () => {
    const { files, failures } = await transpileWorkspace([
      { path: 'broken.ts', content: 'const = : oops' },
      { path: 'fine.ts', content: 'export const ok: number = 1;' },
    ]);

    expect(failures).toHaveLength(1);
    expect(files.find((file) => file.path === 'fine.js')?.content).toContain('export const ok = 1');
  });
});
