import { afterEach, describe, expect, test } from 'vitest';
import { hashPath } from '../scopeCss/scopeCss';
import {
  assetKindOf,
  assetQueryOf,
  buildAssetModule,
  buildQueryAssetModule,
  isStylesheet,
  missingAssetModule,
  unsupportedAssetMessage,
} from './assetModules';

/**
 * Evaluates a generated module the way the frame would, minus the import
 * map: its `export default` becomes the return value, and named exports
 * become plain declarations after it.
 */
function evaluate(source: string): unknown {
  return new Function(source
    .replace(/^export const /gm, 'const ')
    .replace(/\bexport default\b/, 'return'))();
}

/** The names a module exports, and the statement that binds them, as the browser links them. */
function namedExports(source: string): string[] {
  const match = /^export const \{ ([^}]*) \} = __spaceJson;$/m.exec(source);
  return match ? match[1].split(', ') : [];
}

function injectedStyles(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>('style[data-path]')];
}

afterEach(() => {
  for (const style of injectedStyles()) style.remove();
});

describe('assetKindOf', () => {
  test.each([
    ['src/App.css', 'css'],
    ['src/Card.module.css', 'css-module'],
    ['data/items.json', 'json'],
    ['logo.svg', 'svg'],
    ['logo.PNG', 'unsupported'],
    ['theme.scss', 'unsupported'],
  ])('%s is %s', (path, kind) => {
    expect(assetKindOf(path)).toBe(kind);
  });
});

describe('isStylesheet', () => {
  test('counts plain and module stylesheets', () => {
    expect(isStylesheet('a/App.css')).toBe(true);
    expect(isStylesheet('a/Card.module.css')).toBe(true);
  });

  test('not preprocessor sources or other files', () => {
    expect(isStylesheet('a/App.scss')).toBe(false);
    expect(isStylesheet('a/App.js')).toBe(false);
  });
});

describe('buildAssetModule — .css', () => {
  test('appends the stylesheet to <head>, tagged with its path', () => {
    evaluate(buildAssetModule('src/App.css', 'body { color: red; }'));

    const [style] = injectedStyles();
    expect(style.getAttribute('data-path')).toBe('src/App.css');
    expect(style.textContent).toBe('body { color: red; }');
  });

  test('injects a file once, however often it is evaluated', () => {
    const source = buildAssetModule('src/App.css', 'p {}');
    evaluate(source);
    evaluate(source);

    expect(injectedStyles()).toHaveLength(1);
  });

  test('stylesheets land in evaluation order', () => {
    evaluate(buildAssetModule('styles/theme.css', ':root {}'));
    evaluate(buildAssetModule('src/App.css', 'p {}'));

    expect(injectedStyles().map((style) => style.dataset.path))
      .toEqual(['styles/theme.css', 'src/App.css']);
  });

  test('carries CSS that would break out of a string or tag verbatim', () => {
    const css = 'a::after { content: "\\"</style>\'"; }';
    evaluate(buildAssetModule('x.css', css));

    expect(injectedStyles()[0].textContent).toBe(css);
  });
});

describe('buildAssetModule — .module.css', () => {
  const path = 'src/components/Card.module.css';
  const hash = hashPath(path);

  test('exports the class map, with camelCase keys for kebab-case names', () => {
    const classes = evaluate(buildAssetModule(path, '.card {} .card-title {}'));

    expect(classes).toEqual({
      card: `card_${hash}`,
      'card-title': `card-title_${hash}`,
      cardTitle: `card-title_${hash}`,
    });
  });

  test('injects the scoped rules, not the originals', () => {
    evaluate(buildAssetModule(path, '@media (min-width: 1px) { .card { margin: 0.5em; } }'));

    expect(injectedStyles()[0].textContent)
      .toBe(`@media (min-width: 1px) { .card_${hash} { margin: 0.5em; } }`);
  });
});

describe('buildAssetModule — .json', () => {
  test('exports the parsed value', () => {
    expect(evaluate(buildAssetModule('data.json', '{"items": [1, 2], "ok": true}')))
      .toEqual({ items: [1, 2], ok: true });
  });

  test('exports a top-level array or scalar too', () => {
    expect(evaluate(buildAssetModule('list.json', '[1, "two"]'))).toEqual([1, 'two']);
    expect(evaluate(buildAssetModule('n.json', '42'))).toBe(42);
  });

  test('invalid JSON becomes a module that throws, naming the file', () => {
    const source = buildAssetModule('src/data.json', '{ items: [1, }');

    expect(() => evaluate(source)).toThrow(/src\/data\.json.*not valid JSON/);
  });
});

describe('buildAssetModule — .svg', () => {
  test('exports a data: URL of the markup', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
    const url = evaluate(buildAssetModule('logo.svg', svg)) as string;

    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe(svg);
  });
});

describe('buildAssetModule — anything else', () => {
  test('an image throws, naming the file and why', () => {
    expect(() => evaluate(buildAssetModule('img/logo.png', '')))
      .toThrow(/img\/logo\.png.*\.png files are not supported.*stored as text/);
  });

  test('a preprocessor stylesheet says it needs a compiler', () => {
    expect(() => evaluate(buildAssetModule('App.scss', '$x: 1;')))
      .toThrow(/App\.scss.*\.scss files need a compiler/);
    expect(unsupportedAssetMessage('a.less')).toMatch(/\.less files need a compiler/);
  });

  test('building one never throws', () => {
    expect(() => buildAssetModule('weird.bin', '\u0000')).not.toThrow();
  });
});

describe('missingAssetModule', () => {
  test('throws, naming the file', () => {
    expect(() => evaluate(missingAssetModule('src/gone.css')))
      .toThrow(/src\/gone\.css.*no such file/);
  });
});

describe('buildAssetModule — JSON named exports', () => {
  test('each top-level key that can be a binding is a named export, as in Vite', () => {
    const source = buildAssetModule('package.json', '{"version":"1","name":"x","my-key":2,"default":3,"class":4}');

    // `import { version } from '../package.json'` must link.
    expect(namedExports(source)).toEqual(['version', 'name']);
    expect(source).toContain('export default __spaceJson;');
    expect(evaluate(source)).toEqual({ version: '1', name: 'x', 'my-key': 2, default: 3, class: 4 });
  });

  test('an array or a primitive has only a default export', () => {
    expect(namedExports(buildAssetModule('a.json', '[1]'))).toEqual([]);
    expect(namedExports(buildAssetModule('n.json', '1'))).toEqual([]);
  });
});

describe('buildAssetModule — CSS references', () => {
  test('an imported stylesheet has its workspace @import inlined', () => {
    const files = new Map([['src/vars.css', { path: 'src/vars.css', content: ':root { --c: red; }' }]]);
    evaluate(buildAssetModule('src/index.css', "@import './vars.css'; body { color: var(--c) }", (path) => files.get(path)));

    const [style] = injectedStyles();
    expect(style.textContent).toContain('--c: red');
    expect(style.textContent).not.toContain('@import');
  });

  test('a CSS module inlines before scoping, so imported classes are scoped too', () => {
    const files = new Map([['base.css', { path: 'base.css', content: '.base { color: red }' }]]);
    const classes = evaluate(buildAssetModule('a.module.css', "@import './base.css'; .a {}", (path) => files.get(path)));

    expect(classes).toMatchObject({ base: `base_${hashPath('a.module.css')}` });
  });
});

describe('Vite import queries', () => {
  test.each([
    ['?raw', 'raw'],
    ['?url', 'url'],
    ['?inline', 'inline'],
    ['?react', 'react'],
    ['?worker', 'unsupported'],
    ['?v=2', null],
    ['#x', null],
  ])('%s is %s', (query, kind) => {
    expect(assetQueryOf(query)).toBe(kind);
  });

  test('?raw is the text', () => {
    expect(evaluate(buildQueryAssetModule('notes.txt', 'raw', 'hello "x"'))).toBe('hello "x"');
  });

  test('?url is a data: URL', () => {
    expect(evaluate(buildQueryAssetModule('icon.svg', 'url', '<svg/>')))
      .toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg/>')}`);
  });

  test('?inline of a stylesheet is its text, and applies nothing', () => {
    expect(evaluate(buildQueryAssetModule('a.css', 'inline', 'a { color: red }'))).toBe('a { color: red }');
    expect(injectedStyles()).toHaveLength(0);
  });

  test('?react is a component that imports React', () => {
    const source = buildQueryAssetModule('logo.svg', 'react', '<svg viewBox="0 0 1 1"><path/></svg>');
    expect(source).toMatch(/^import \{ createElement \} from 'react';/);
    expect(source).toContain('export default SvgComponent;');
  });

  test('?react of something that is not an SVG says so', () => {
    expect(buildQueryAssetModule('a.css', 'react', '')).toContain('only an .svg file');
  });
});
