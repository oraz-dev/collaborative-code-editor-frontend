import {
  buildAliases,
  buildPreviewDocument,
  isRunnable,
  whyNotRunnable,
} from './buildPreviewDocument';
import { hashPath } from '../scopeCss/scopeCss';
import { MODULE_LOADER } from './runtime';

describe('isRunnable', () => {
  test.each(['a.js', 'a.mjs', 'a.jsx', 'a.ts', 'a.tsx', 'page.html'])('%s runs', (name) => {
    expect(isRunnable(name)).toBe(true);
  });

  test.each(['a.css', 'notes.md'])('%s does not', (name) => {
    expect(isRunnable(name)).toBe(false);
  });
});

describe('whyNotRunnable', () => {
  test('says nothing about a file that runs', () => {
    expect(whyNotRunnable('a.js')).toBeNull();
  });

  test('TypeScript runs now that types are stripped before the sandbox sees it', () => {
    expect(whyNotRunnable('a.ts')).toBeNull();
    expect(whyNotRunnable('a.tsx')).toBeNull();
  });

  test('explains that a stylesheet needs a page', () => {
    expect(whyNotRunnable('a.css')).toMatch(/stylesheet/i);
  });
});

describe('buildPreviewDocument', () => {
  const entry = 'main.js';

  test('inlines the entry module and names it for the loader', () => {
    const html = buildPreviewDocument({
      files: [{ path: entry, content: 'console.log(1)' }],
      entry,
    });

    expect(html).toContain('data-entry="main.js"');
    expect(html).toContain('console.log(1)');
  });

  test('rewrites relative imports so blob modules can resolve each other', () => {
    const html = buildPreviewDocument({
      files: [
        { path: entry, content: "import { sum } from './math.js';" },
        { path: 'math.js', content: 'export const sum = 1;' },
      ],
      entry,
    });

    expect(html).toContain('workspace:math.js');
  });

  test('neutralises a closing script tag hidden in user code', () => {
    // Unescaped, this string would terminate the JSON island early and the
    // rest would be parsed as markup — an injection into the preview frame.
    const source = 'const s = "</script><img onerror=alert(1)>";';
    const html = buildPreviewDocument({ files: [{ path: entry, content: source }], entry });

    const start = html.indexOf('data-entry=');
    const island = html.slice(html.indexOf('>', start) + 1);
    const payload = island.slice(0, island.indexOf('</script>')).trim();

    // The island still terminates at the tag we wrote, and everything before
    // it is intact JSON — so nothing escaped into markup.
    expect(() => JSON.parse(payload)).not.toThrow();
    expect(JSON.parse(payload)[entry]).toContain(source);
  });

  test('still produces a document when the entry file is missing', () => {
    const html = buildPreviewDocument({ files: [], entry });
    expect(html).toContain('data-entry="main.js"');
  });

  test('inlines workspace stylesheets', () => {
    const html = buildPreviewDocument({
      files: [
        { path: entry, content: '' },
        { path: 'style.css', content: 'body { color: red; }' },
      ],
      entry,
    });

    expect(html).toContain('body { color: red; }');
  });

  test('inlines only the stylesheets in the entry\'s own folder', () => {
    // Another folder's global rules must not restyle this page just because
    // the whole project is loaded now.
    const html = buildPreviewDocument({
      files: [
        { path: 'src/main.js', content: '' },
        { path: 'src/app.css', content: '.mine { color: red; }' },
        { path: 'other/demo.css', content: '.theirs { color: blue; }' },
        { path: 'root.css', content: '.root { color: green; }' },
      ],
      entry: 'src/main.js',
    });

    expect(html).toContain('.mine { color: red; }');
    expect(html).not.toContain('.theirs');
    expect(html).not.toContain('.root');
  });

  test('an html entry inlines only the stylesheets beside it', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'site/index.html', content: '<h1>hi</h1>' },
        { path: 'site/style.css', content: '.mine {}' },
        { path: 'elsewhere/style.css', content: '.theirs {}' },
      ],
      entry: 'site/index.html',
    });

    expect(html).toContain('.mine {}');
    expect(html).not.toContain('.theirs');
  });

  test('resolves each module\'s imports from its own folder', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'src/main.js', content: "import { Card } from './components/Card.js';" },
        { path: 'src/components/Card.js', content: "import { sum } from '../lib/math.js';" },
        { path: 'src/lib/math.js', content: 'export const sum = 1;' },
      ],
      entry: 'src/main.js',
    });
    const modules = modulesIn(html);

    expect(modules['src/main.js']).toContain('workspace:src/components/Card.js');
    expect(modules['src/components/Card.js']).toContain('workspace:src/lib/math.js');
  });

  test('names a nested entry by its full path', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'src/App.js', content: '' }],
      entry: 'src/App.tsx',
    });

    expect(html).toContain('data-entry="src/App.js"');
  });

  test('leaves an html entry as the document, adding the console bridge', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'index.html', content: '<html><head></head><body><h1>hi</h1></body></html>' }],
      entry: 'index.html',
    });

    expect(html).toContain('<h1>hi</h1>');
    expect(html).toContain('__space_preview__');
    // A page brings its own scripts, so the module loader must stay out of it.
    // Matched on the island itself: the console bridge legitimately mentions
    // the id, because that is how it detects there is no loader to report for it.
    expect(html).not.toContain('id="__workspace__"');
    expect(html).not.toContain('importmap');
  });

  test('wraps a bare html fragment into a full document', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'index.html', content: '<h1>hi</h1>' }],
      entry: 'index.html',
    });

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<h1>hi</h1>');
  });

  test('excludes non-script files from the module map', () => {
    const html = buildPreviewDocument({
      files: [
        { path: entry, content: '' },
        { path: 'README.md', content: '# docs' },
      ],
      entry,
    });

    const island = html.slice(html.indexOf('id="__workspace__"'));
    expect(island.slice(0, island.indexOf('</script>'))).not.toContain('README.md');
  });

  test('resolves npm imports through the import map, with no CDN URL in the code', () => {
    const html = buildPreviewDocument({
      files: [{ path: entry, content: "import { useState } from 'react';" }],
      entry,
    });
    const packages = packagesIn(html);

    expect(packages.react).toBe('https://esm.sh/react@19');
  });

  test('gives a React app somewhere to mount', () => {
    const html = buildPreviewDocument({ files: [{ path: entry, content: '' }], entry });

    expect(html).toContain('<div id="root"></div>');
  });

  test('mounts the default export of a component file', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'App.js', content: 'export default function App() {}' }],
      entry: 'App.tsx',
    });

    expect(html).toContain('data-mount="default"');
    // The loader imports these itself, so they must be mapped even unimported.
    expect(packagesIn(html)['react-dom/client']).toContain('esm.sh/react-dom@19/client');
  });

  test('does not mount a component file that renders itself', () => {
    const html = buildPreviewDocument({
      files: [{
        path: 'App.js',
        content: "import { createRoot } from 'react-dom/client';\ncreateRoot(el).render(x);\nexport default 1;",
      }],
      entry: 'App.tsx',
    });

    expect(html).not.toContain('data-mount');
  });

  test('never mounts a plain script’s default export', () => {
    const html = buildPreviewDocument({
      files: [{ path: entry, content: 'export default function main() {}' }],
      entry,
    });

    expect(html).not.toContain('data-mount');
  });

  test('paints its own background, so dark-scheme text is never white on white', () => {
    const html = buildPreviewDocument({ files: [{ path: entry, content: '' }], entry });

    expect(html).toContain('background: Canvas');
    expect(html).toContain('color: CanvasText');
  });
});

describe('buildAliases', () => {
  test('accepts the extensionless and source spellings of a module', () => {
    const aliases = buildAliases({ 'src/util.js': '' });

    expect(aliases['src/util']).toBe('src/util.js');
    expect(aliases['src/util.ts']).toBe('src/util.js');
    expect(aliases['src/util.tsx']).toBe('src/util.js');
  });

  test('resolves a folder to its index module', () => {
    // `./components` and `./components/` both normalise to `components`.
    const aliases = buildAliases({ 'components/index.js': '', 'components/Button.js': '' });

    expect(aliases.components).toBe('components/index.js');
  });

  test('resolves a nested folder to its index module', () => {
    const aliases = buildAliases({ 'src/ui/index.js': '' });

    expect(aliases['src/ui']).toBe('src/ui/index.js');
  });

  test('a plain .jsx index that was not renamed is still found', () => {
    expect(buildAliases({ 'lib/index.jsx': '' }).lib).toBe('lib/index.jsx');
  });

  test('a file beats a folder index of the same name, whichever is listed first', () => {
    const folderFirst = buildAliases({ 'components/index.js': '', 'components.js': '' });
    const fileFirst = buildAliases({ 'components.js': '', 'components/index.js': '' });

    expect(folderFirst.components).toBe('components.js');
    expect(fileFirst.components).toBe('components.js');
  });

  test('never shadows a real module', () => {
    const aliases = buildAliases({ 'a.js': '', 'a.ts': '' });

    expect(aliases).not.toHaveProperty('a.js');
    expect(aliases).not.toHaveProperty('a.ts');
  });

  test('ends up in the document, so the loader can map them', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import { Button } from './components';" },
        { path: 'components/index.js', content: "export * from './Button';" },
        { path: 'components/Button.js', content: 'export const Button = 1;' },
      ],
      entry: 'main.js',
    });

    expect(aliasesIn(html).components).toBe('components/index.js');
    expect(aliasesIn(html)['components/Button']).toBe('components/Button.js');
    expect(modulesIn(html)['components/index.js']).toContain('workspace:components/Button');
  });
});

describe('buildPreviewDocument — importing non-script files', () => {
  test('a nested module imports a stylesheet from a sibling folder', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'src/main.js', content: "import './components/Card.js';" },
        { path: 'src/components/Card.js', content: "import '../styles/theme.css';" },
        { path: 'src/styles/theme.css', content: ':root { --accent: teal; }' },
      ],
      entry: 'src/main.js',
    });
    const modules = modulesIn(html);

    expect(modules['src/components/Card.js']).toContain("'workspace:src/styles/theme.css'");
    expect(modules['src/styles/theme.css']).toContain('--accent: teal');
    expect(modules['src/styles/theme.css']).toContain("document.createElement('style')");
  });

  test('a CSS module is scoped and exports its class map', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'src/Card.js', content: "import cls from './Card.module.css';" },
        { path: 'src/Card.module.css', content: '.card-title { margin: 0.5em; }' },
      ],
      entry: 'src/Card.js',
    });
    const hash = hashPath('src/Card.module.css');
    const module = modulesIn(html)['src/Card.module.css'];

    expect(module).toContain(`card-title_${hash} { margin: 0.5em; }`);
    expect(module).toContain(`"cardTitle":"card-title_${hash}"`);
  });

  test('JSON and SVG imports get their modules', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import data from './data/items.json';\nimport logo from './logo.svg';" },
        { path: 'data/items.json', content: '{"a": 1}' },
        { path: 'logo.svg', content: '<svg/>' },
      ],
      entry: 'main.js',
    });
    const modules = modulesIn(html);

    expect(modules['data/items.json']).toContain('const __spaceJson = {"a":1};');
    expect(modules['data/items.json']).toContain('export const { a } = __spaceJson;');
    expect(modules['logo.svg']).toContain('data:image/svg+xml');
  });

  test('bad JSON still builds a document, with a module that names the file', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import data from './data.json';" },
        { path: 'data.json', content: '{nope' },
      ],
      entry: 'main.js',
    });

    expect(modulesIn(html)['data.json']).toMatch(/throw new Error\(.*data\.json.*not valid JSON/);
  });

  test('an unsupported type builds, with a module explaining the file cannot be imported', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import logo from './logo.png';\nimport './theme.scss';" },
        { path: 'logo.png', content: 'PNG' },
        { path: 'theme.scss', content: '$a: 1;' },
      ],
      entry: 'main.js',
    });
    const modules = modulesIn(html);

    expect(modules['logo.png']).toMatch(/logo\.png.*not supported/);
    expect(modules['theme.scss']).toMatch(/theme\.scss.*compiler/);
  });

  test('an import of a file that is not in the project says so by name', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'main.js', content: "import './gone.css';" }],
      entry: 'main.js',
    });

    expect(modulesIn(html)['gone.css']).toMatch(/gone\.css.*no such file/);
  });

  test('an asset import must name its extension', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import './App';" },
        { path: 'App.css', content: 'p {}' },
      ],
      entry: 'main.js',
    });

    expect(aliasesIn(html)).not.toHaveProperty('App');
    expect(modulesIn(html)).not.toHaveProperty('App.css');
    expect(modulesIn(html)).not.toHaveProperty('App');
  });

  test('files nobody imports stay out of the module map', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: '' },
        { path: 'data.json', content: '{}' },
        { path: 'logo.svg', content: '<svg/>' },
      ],
      entry: 'main.js',
    });

    expect(Object.keys(modulesIn(html))).toEqual(['main.js']);
  });

  test('once any module imports a stylesheet, none are inlined automatically', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'src/main.js', content: "import './lib/used.js';" },
        { path: 'src/lib/used.js', content: "import './used.css';" },
        { path: 'src/lib/used.css', content: '.imported {}' },
        { path: 'src/unused.css', content: '.beside-the-entry {}' },
      ],
      entry: 'src/main.js',
    });

    expect(html).not.toContain('<style data-path="src/unused.css">');
    expect(html).not.toContain('.beside-the-entry');
    expect(modulesIn(html)['src/lib/used.css']).toContain('.imported {}');
  });

  test('an unrelated folder importing a stylesheet does not switch inlining off', () => {
    // Only what the entry reaches decides: demo2 importing CSS says nothing
    // about how demo1 is styled.
    const html = buildPreviewDocument({
      files: [
        { path: 'demo1/main.js', content: '' },
        { path: 'demo1/style.css', content: 'body { color: red }' },
        { path: 'demo2/main.js', content: "import './style.css';" },
        { path: 'demo2/style.css', content: '.demo2 {}' },
      ],
      entry: 'demo1/main.js',
    });

    expect(html).toContain('<style data-path="demo1/style.css">');
    expect(html).not.toContain('<style data-path="demo2/style.css">');
  });

  test('a stylesheet imported anywhere the entry reaches, transitively, switches inlining off', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import { w } from './ui';" },
        { path: 'ui/index.js', content: "export { w } from './Widget.js';" },
        { path: 'ui/Widget.js', content: "import './Widget.module.css'; export const w = 1;" },
        { path: 'ui/Widget.module.css', content: '.w {}' },
        { path: 'style.css', content: '.beside {}' },
      ],
      entry: 'main.js',
    });

    expect(html).not.toContain('.beside {}');
  });

  test('a stylesheet only read as text (?inline) does not count as styling the page', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import css from './a.css?inline';" },
        { path: 'a.css', content: '.a {}' },
        { path: 'style.css', content: '.beside {}' },
      ],
      entry: 'main.js',
    });

    expect(html).toContain('.beside {}');
  });

  test('an html entry still inlines its folder\'s CSS, imports or not', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'index.html', content: '<h1>hi</h1>' },
        { path: 'style.css', content: '.page {}' },
        { path: 'app.js', content: "import './style.css';" },
      ],
      entry: 'index.html',
    });

    expect(html).toContain('.page {}');
  });

  test('a generated module\'s text is never mistaken for a package import', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import data from './data.json';" },
        { path: 'data.json', content: JSON.stringify({ code: "import x from 'left-pad'" }) },
      ],
      entry: 'main.js',
    });

    expect(packagesIn(html)).not.toHaveProperty('left-pad');
  });
});

describe('buildPreviewDocument for a page with module scripts', () => {
  const META = ['import', 'meta'].join('.');
  const VITE_PAGE = '<!doctype html><html><head><title>t</title>'
    + '<script>window.early = 1;</script></head>'
    + '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';

  test('runs the module a Vite index.html names, through the loader', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'index.html', content: VITE_PAGE },
        { path: 'src/main.js', content: "import { createRoot } from 'react-dom/client';" },
      ],
      entry: 'index.html',
    });

    const page = parse(html);
    expect(entriesIn(page)).toEqual(['src/main.js']);
    // Put back as a native module script importing the resolved module.
    const modules = page.querySelectorAll('script[type="module"]');
    expect(modules).toHaveLength(1);
    expect(modules[0].textContent).toBe('import "workspace:src/main.js";');
    expect(modulesIn(html)).toHaveProperty('src/main.js');
    expect(packagesIn(html)).toHaveProperty('react-dom/client');
    // Kept: the page's own markup and classic scripts.
    expect(page.getElementById('root')).not.toBeNull();
    expect(html).toContain('window.early = 1;');
  });

  test('the console bridge runs before anything the page brings', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'index.html', content: VITE_PAGE }, { path: 'src/main.js', content: '' }],
      entry: 'index.html',
    });

    const scripts = [...parse(html).querySelectorAll('script:not([type])')].map((node) => node.textContent ?? '');
    expect(scripts[0]).toContain('__space_preview__');
    expect(html.indexOf('__space_preview__')).toBeLessThan(html.indexOf('window.early'));
    expect(html.indexOf('__space_preview__')).toBeLessThan(html.indexOf('id="__workspace__"'));
  });

  test('src is relative to the page folder unless it starts with a slash', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'site/index.html', content: '<script type="module" src="./app.js"></script><script type="module" src="/lib/x.js"></script>' },
        { path: 'site/app.js', content: '' },
        { path: 'lib/x.js', content: '' },
      ],
      entry: 'site/index.html',
    });

    expect(entriesIn(parse(html))).toEqual(['site/app.js', 'lib/x.js']);
  });

  test('inline module bodies are resolved like any workspace module', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'site/index.html', content: '<script type="module">import { a } from "./a.js"; import confetti from "canvas-confetti";</script>' },
        { path: 'site/a.js', content: 'export const a = 1;' },
      ],
      entry: 'site/index.html',
    });

    const entries = entriesIn(parse(html));
    expect(entries).toEqual(['site/index.html.module-1.js']);
    const inline = modulesIn(html)[entries[0]];
    expect(inline).toContain('workspace:site/a.js');
    expect(packagesIn(html)).toHaveProperty('canvas-confetti');
    // A synthetic module never claims an alias a real file should have.
    expect(Object.values(aliasesIn(html))).not.toContain(entries[0]);
  });

  test('a page with no module scripts gets no loader', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'index.html', content: '<script src="app.js"></script>' }, { path: 'app.js', content: '' }],
      entry: 'index.html',
    });

    expect(html).not.toContain('id="__workspace__"');
    expect(html).toContain('<script src="app.js"></script>');
  });

  test('a linked stylesheet is inlined where it was linked, and replaces the folder fallback', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'index.html', content: '<head><link rel="stylesheet" href="/a.css"></head><body></body>' },
        { path: 'a.css', content: '.linked {}' },
        { path: 'b.css', content: '.unlinked {}' },
      ],
      entry: 'index.html',
    });

    expect(html).toContain('<style data-path="a.css">\n.linked {}');
    expect(html).not.toContain('.unlinked');
  });

  test('a module importing CSS switches the folder fallback off for a page too', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'index.html', content: VITE_PAGE },
        { path: 'src/main.js', content: "import './index.css';" },
        { path: 'src/index.css', content: '.imported {}' },
        { path: 'leftover.css', content: '.leftover {}' },
      ],
      entry: 'index.html',
    });

    expect(html).not.toContain('.leftover');
    expect(modulesIn(html)['src/index.css']).toContain('.imported {}');
  });

  test('a page without <head> gets one inside <html>, never inside <header>', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'index.html', content: '<html><body><header class="top">x</header></body></html>' }],
      entry: 'index.html',
    });

    expect(html).toMatch(/^<html><head><script>/);
    expect(html).toContain('<header class="top">x</header>');
  });

  test('a module script naming a missing file is still handed to the loader to report', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'index.html', content: '<script type="module" src="/src/nope.tsx"></script>' }],
      entry: 'index.html',
    });

    expect(entriesIn(parse(html))).toEqual(['src/nope.js']);
    expect(modulesIn(html)).not.toHaveProperty('src/nope.js');
  });

  test('import.meta.env and import.meta.hot are shimmed in every workspace module', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: `import './b.js'; console.log(${META}.env.MODE);` },
        { path: 'b.js', content: `if (${META}.hot) ${META}.hot.accept();` },
      ],
      entry: 'main.js',
    });

    const modules = modulesIn(html);
    expect(modules['main.js']).toContain('__spaceImportMetaEnv.MODE');
    expect(modules['main.js']).toContain('Object.assign({}, globalThis.__spaceViteEnv)');
    expect(modules['b.js']).toBe('if (undefined) undefined.accept();');
    // The loader defines what the rewritten code reads.
    expect(html).toContain('window.__spaceViteEnv = Object.freeze(');
  });

  test('a root-absolute import falls back to public/, as Vite serves it', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'src/App.js', content: "import viteLogo from '/vite.svg';" },
        { path: 'public/vite.svg', content: '<svg/>' },
      ],
      entry: 'src/App.js',
    });

    expect(modulesIn(html)['src/App.js']).toContain("'workspace:vite.svg'");
    expect(modulesIn(html)['vite.svg']).toContain('data:image/svg+xml');
  });
});

describe('buildPreviewDocument — escaping what it inlines', () => {
  test('"<!--" then "<script" in a module cannot swallow the rest of the document', () => {
    const source = "const open = '<!--';\nel.innerHTML = '<script src=x>';";
    const html = buildPreviewDocument({ files: [{ path: 'main.js', content: source }], entry: 'main.js' });
    const page = parse(html);

    // Every island and the loader are still their own elements.
    expect(page.getElementById('__aliases__')).not.toBeNull();
    expect(page.getElementById('__packages__')).not.toBeNull();
    const loader = [...page.querySelectorAll('script:not([type])')]
      .some((node) => (node.textContent ?? '').includes("map.type = 'importmap'"));
    expect(loader).toBe(true);
    const workspace = JSON.parse(page.getElementById('__workspace__')?.textContent ?? '') as Record<string, string>;
    expect(workspace['main.js']).toBe(source);
  });

  test('a folder stylesheet cannot close its <style>, and a quote in its name cannot break the tag', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: '' },
        { path: 'style.css', content: '/* close with </style> */ a::after { content: "</style>"; }' },
        { path: 'a">b.css', content: '.b {}' },
      ],
      entry: 'main.js',
    });
    const page = parse(html);

    const styles = [...page.querySelectorAll('style[data-path]')];
    expect(styles.map((node) => node.getAttribute('data-path'))).toEqual(['style.css', 'a">b.css']);
    expect(styles[0].textContent).toContain('a::after');
    expect(page.body.textContent).not.toContain('a::after');
  });

  test('the folder stylesheets of a page are escaped the same way', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'index.html', content: '<body><p>hi</p></body>' },
        { path: 'style.css', content: 'p::after { content: "</style>x"; }' },
      ],
      entry: 'index.html',
    });

    expect(parse(html).body.textContent?.trim()).toBe('hi');
  });
});

describe('buildPreviewDocument — CSS references', () => {
  test('an imported stylesheet brings its @import along', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: "import './index.css';" },
        { path: 'index.css', content: "@import './vars.css'; body { color: var(--c) }" },
        { path: 'vars.css', content: ':root { --c: red; }' },
      ],
      entry: 'main.js',
    });

    expect(modulesIn(html)['index.css']).toContain('--c: red');
    expect(modulesIn(html)['index.css']).not.toContain('@import');
  });

  test('a folder stylesheet has its url() resolved, with a console warning for what cannot load', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'main.js', content: '' },
        { path: 'style.css', content: 'body { background: url(./bg.svg) } h1 { background: url(./photo.png) }' },
        { path: 'bg.svg', content: '<svg/>' },
      ],
      entry: 'main.js',
    });

    expect(html).toContain(`url("data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg/>')}")`);
    expect(html).toMatch(/console\.warn\("style\.css: url\(\.\/photo\.png\) names no file/);
  });
});

describe('buildPreviewDocument — imports the way Vite resolves them', () => {
  test('Vite query imports are not reported as missing files', () => {
    const html = buildPreviewDocument({
      files: [
        {
          path: 'src/main.js',
          content: "import Logo from './logo.svg?react';\nimport raw from './a.css?inline';\nimport u from './icon.svg?url';\nimport t from './notes.txt?raw';",
        },
        { path: 'src/logo.svg', content: '<svg/>' },
        { path: 'src/a.css', content: '.a {}' },
        { path: 'src/icon.svg', content: '<svg id="i"/>' },
        { path: 'src/notes.txt', content: 'hello' },
      ],
      entry: 'src/main.js',
    });
    const modules = modulesIn(html);

    for (const key of ['src/logo.svg?react', 'src/a.css?inline', 'src/icon.svg?url', 'src/notes.txt?raw']) {
      expect(modules[key], key).toBeDefined();
      expect(modules[key], key).not.toContain('no such file');
    }
    expect(modules['src/main.js']).toContain("'workspace:src/logo.svg?react'");
    expect(modules['src/notes.txt?raw']).toBe('export default "hello";\n');
    // The component needs React, even though no script imports it.
    expect(packagesIn(html)).toHaveProperty('react');
  });

  test('an unsupported query says so, instead of claiming the file is missing', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'main.js', content: "import W from './w.js?worker';" }, { path: 'w.js', content: '' }],
      entry: 'main.js',
    });

    expect(modulesIn(html)['w.js?worker']).toContain('?worker imports are not supported');
  });

  test('a cache-busting query on a script reaches the script', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'main.js', content: "import './util.js?v=2';" }, { path: 'util.js', content: '' }],
      entry: 'main.js',
    });

    expect(aliasesIn(html)['util.js?v=2']).toBe('util.js');
  });

  test('an extensionless import reaches a .json file, as Vite\'s resolve.extensions does', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'src/main.js', content: "import d from './data';" }, { path: 'src/data.json', content: '{"a":1}' }],
      entry: 'src/main.js',
    });

    expect(modulesIn(html)['src/data']).toContain('const __spaceJson = {"a":1};');
  });

  test('an @/ path alias resolves to the workspace file, and nothing is sent to the CDN', () => {
    const html = buildPreviewDocument({
      files: [
        { path: 'src/main.js', content: "import { Button } from '@/components/Button';" },
        { path: 'src/components/Button.js', content: 'export const Button = 1;' },
      ],
      entry: 'src/main.js',
    });

    expect(modulesIn(html)['src/main.js']).toContain("'workspace:src/components/Button'");
    expect(aliasesIn(html)['src/components/Button']).toBe('src/components/Button.js');
    expect(html).not.toContain('esm.sh/@@');
    expect(Object.keys(packagesIn(html))).toEqual([]);
  });

  test('a bare specifier that is no package fails by name rather than reaching the CDN', () => {
    const html = buildPreviewDocument({
      files: [{ path: 'main.js', content: "import x from '@/nowhere';" }],
      entry: 'main.js',
    });

    const url = packagesIn(html)['@/nowhere'];
    expect(url).toMatch(/^data:text\/javascript/);
    expect(decodeURIComponent(url)).toContain('Cannot import \\"@/nowhere\\"');
  });
});

describe('buildPreviewDocument — a page\'s own import map', () => {
  test('the page\'s entries win, and its tag is removed so only one map exists', () => {
    const html = buildPreviewDocument({
      files: [{
        path: 'index.html',
        content: '<head><script type="importmap">{"imports":{"vue":"https://unpkg.com/vue@3/dist/vue.esm-browser.js"},'
          + '"scopes":{"https://x/":{"a":"https://a"}}}</script></head>'
          + '<body><div id="app">{{ message }}</div>'
          + '<script type="module">import { createApp } from \'vue\'; createApp({}).mount(\'#app\');</script></body>',
      }],
      entry: 'index.html',
    });
    const page = parse(html);

    expect(page.querySelector('script[type="importmap"]')).toBeNull();
    expect(packagesIn(html).vue).toBe('https://unpkg.com/vue@3/dist/vue.esm-browser.js');
    expect(islandIn(html, '__scopes__')).toEqual({ 'https://x/': { a: 'https://a' } });
  });
});

describe('buildPreviewDocument — a page\'s module scripts run natively', () => {
  test('each is put back where it was, in order, after the loader\'s map', () => {
    const html = buildPreviewDocument({
      files: [
        {
          path: 'index.html',
          content: '<head><script type="module" src="./head.js"></script></head>'
            + '<body><p id="a"></p><script type="module">document.addEventListener("DOMContentLoaded", init);</script>'
            + '<p id="b"></p><script type="module" src="/missing.js"></script></body>',
        },
        { path: 'head.js', content: '' },
      ],
      entry: 'index.html',
    });
    const page = parse(html);

    const scripts = [...page.querySelectorAll('script[type="module"]')].map((node) => node.textContent);
    expect(scripts).toEqual([
      'import "workspace:head.js";',
      'import "workspace:index.html.module-1.js";',
      'throw new Error("Cannot run \\"missing.js\\": there is no such file in this project.");',
    ]);
    // Native module scripts run before DOMContentLoaded, so the listener fires.
    expect(page.getElementById('__workspace__')?.dataset.run).toBe('native');
    expect(html.indexOf(MODULE_LOADER)).toBeLessThan(html.indexOf('import "workspace:head.js"'));
  });
});

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** The entries the loader will run, from either spelling of the attribute. */
function entriesIn(page: Document): string[] {
  const node = page.getElementById('__workspace__') as HTMLElement;
  return node.dataset.entries
    ? (JSON.parse(node.dataset.entries) as string[])
    : [node.dataset.entry ?? ''];
}

function islandIn(html: string, id: string): Record<string, string> {
  const start = html.indexOf(`id="${id}"`);
  const island = html.slice(html.indexOf('>', start) + 1);
  return JSON.parse(island.slice(0, island.indexOf('</script>'))) as Record<string, string>;
}

function modulesIn(html: string): Record<string, string> {
  return islandIn(html, '__workspace__');
}

function aliasesIn(html: string): Record<string, string> {
  return islandIn(html, '__aliases__');
}

function packagesIn(html: string): Record<string, string> {
  const start = html.indexOf('id="__packages__"');
  const island = html.slice(html.indexOf('>', start) + 1);
  return JSON.parse(island.slice(0, island.indexOf('</script>'))) as Record<string, string>;
}
