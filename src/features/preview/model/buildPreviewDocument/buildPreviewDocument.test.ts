import {
  buildPreviewDocument,
  isRunnable,
  whyNotRunnable,
} from './buildPreviewDocument';

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

function packagesIn(html: string): Record<string, string> {
  const start = html.indexOf('id="__packages__"');
  const island = html.slice(html.indexOf('>', start) + 1);
  return JSON.parse(island.slice(0, island.indexOf('</script>'))) as Record<string, string>;
}
