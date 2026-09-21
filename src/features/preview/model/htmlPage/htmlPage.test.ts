import {
  hasModuleScript, modulePlaceholder, resolvePageUrl, transformPage,
} from './htmlPage';

describe('resolvePageUrl', () => {
  test('a leading slash is from the project root', () => {
    expect(resolvePageUrl('/src/main.tsx', 'site/index.html')).toBe('src/main.tsx');
  });

  test('anything else is from the page folder', () => {
    expect(resolvePageUrl('./main.tsx', 'site/index.html')).toBe('site/main.tsx');
    expect(resolvePageUrl('main.tsx', 'site/index.html')).toBe('site/main.tsx');
    expect(resolvePageUrl('../lib/a.js', 'site/index.html')).toBe('lib/a.js');
  });

  test('drops a query or hash', () => {
    expect(resolvePageUrl('/style.css?v=2', 'index.html')).toBe('style.css');
  });

  test.each(['https://cdn.example/a.js', '//cdn.example/a.js', 'data:text/css,', '', '?v=1'])(
    '%s is outside the workspace',
    (url) => {
      expect(resolvePageUrl(url, 'index.html')).toBeNull();
    },
  );
});

describe('hasModuleScript', () => {
  test('finds a Vite entry script', () => {
    expect(hasModuleScript('<div id="root"></div><script type="module" src="/src/main.tsx"></script>')).toBe(true);
  });

  test('accepts unquoted and single-quoted attributes in any order', () => {
    expect(hasModuleScript("<script src='/main.js' type=module></script>")).toBe(true);
  });

  test('a classic script or an inline module is not an app entry', () => {
    expect(hasModuleScript('<script src="/main.js"></script>')).toBe(false);
    expect(hasModuleScript('<script type="module">import "./a.js";</script>')).toBe(false);
    expect(hasModuleScript('<script type="module" src=""></script>')).toBe(false);
  });

  test('ignores a commented-out script', () => {
    expect(hasModuleScript('<!-- <script type="module" src="/main.js"></script> -->')).toBe(false);
  });

  test('a module from a CDN is not the app\'s own entry', () => {
    expect(hasModuleScript('<script type="module" src="https://cdn.x/y.js"></script>')).toBe(false);
    expect(hasModuleScript('<script type="module" src="//cdn.x/y.js"></script>')).toBe(false);
  });

  test('with the files at hand, the module must exist', () => {
    const page = '<script type="module" src="/src/main.tsx"></script>';
    expect(hasModuleScript(page, 'index.html', [{ path: 'src/main.tsx', content: '' }])).toBe(true);
    expect(hasModuleScript(page, 'index.html', [{ path: 'src/App.tsx', content: '' }])).toBe(false);
  });
});

describe('transformPage', () => {
  test('takes module scripts out, in document order', () => {
    const { html, modules } = transformPage(
      '<head><script type="module" src="./a.js"></script></head>'
        + '<body><script type="module">import "./b.js";</script>'
        + '<script type="module" src="/src/c.tsx"></script></body>',
      'app/index.html',
      [],
    );

    expect(modules).toEqual([
      { kind: 'src', path: 'app/a.js' },
      { kind: 'inline', source: 'import "./b.js";' },
      { kind: 'src', path: 'src/c.tsx' },
    ]);
    expect(html).not.toContain('<script');
    // Each leaves its mark where it was, for a native module script to go back.
    expect(html.indexOf(modulePlaceholder(0))).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf(modulePlaceholder(2))).toBeGreaterThan(html.indexOf(modulePlaceholder(1)));
  });

  test('takes the page\'s import map out, merged, when there are modules to run', () => {
    const { html, importMap } = transformPage(
      '<script type="importmap">{"imports":{"vue":"https://unpkg.com/vue@3/dist/vue.esm-browser.js"}}</script>'
        + '<script type="importmap">{"imports":{"vue":"https://other","three/addons/":"https://x/"},"scopes":{"/a/":{"b":"https://b"}}}</script>'
        + '<script type="module">import { createApp } from "vue";</script>',
      'index.html',
      [],
    );

    expect(html).not.toContain('importmap');
    expect(importMap).toEqual({
      imports: { vue: 'https://unpkg.com/vue@3/dist/vue.esm-browser.js', 'three/addons/': 'https://x/' },
      scopes: { '/a/': { b: 'https://b' } },
    });
  });

  test('leaves the import map alone when nothing goes through the loader', () => {
    const page = '<script type="importmap">{"imports":{}}</script><script src="a.js"></script>';
    const { html, importMap } = transformPage(page, 'index.html', []);
    expect(html).toBe(page);
    expect(importMap).toBeNull();
  });

  test('a linked stylesheet has its @import resolved', () => {
    const { html, warnings } = transformPage(
      '<link rel="stylesheet" href="css/a.css">',
      'index.html',
      [
        { path: 'css/a.css', content: "@import './b.css'; a { background: url(./x.png) }" },
        { path: 'css/b.css', content: '.b { color: red }' },
      ],
    );
    expect(html).toContain('.b { color: red }');
    expect(html).not.toContain('@import');
    expect(warnings).toEqual([expect.stringContaining('url(./x.png)')]);
  });

  test('leaves classic scripts, external modules and comments alone', () => {
    const page = '<script>var a = 1;</script>'
      + '<script type="module" src="https://cdn.example/x.js"></script>'
      + '<!-- <script type="module" src="/y.js"></script> -->';
    const { html, modules } = transformPage(page, 'index.html', []);

    expect(html).toBe(page);
    expect(modules).toEqual([]);
  });

  test('inlines a linked workspace stylesheet in place', () => {
    const { html, linkedStyles } = transformPage(
      '<link rel="stylesheet" href="./style.css"><p>hi</p>',
      'index.html',
      [{ path: 'style.css', content: 'p { color: red; }' }],
    );

    expect(html).toBe('<style data-path="style.css">\np { color: red; }\n</style><p>hi</p>');
    expect(linkedStyles).toEqual(['style.css']);
  });

  test('leaves other links, missing files and non-CSS alone', () => {
    const page = '<link rel="icon" href="/vite.svg"><link rel="stylesheet" href="/missing.css">'
      + '<link rel="stylesheet" href="/data.json">';
    const { html, linkedStyles } = transformPage(page, 'index.html', [{ path: 'data.json', content: '{}' }]);

    expect(html).toBe(page);
    expect(linkedStyles).toEqual([]);
  });

  test('a <link> written inside a script is text, not a tag', () => {
    const page = '<script>document.write(\'<link rel="stylesheet" href="s.css">\')</script>';
    const { html } = transformPage(page, 'index.html', [{ path: 's.css', content: 'a{}' }]);
    expect(html).toBe(page);
  });

  test('a stylesheet cannot close the tag it is inlined into', () => {
    const { html } = transformPage(
      '<link rel="stylesheet" href="s.css">',
      'index.html',
      [{ path: 's.css', content: 'a::after { content: "</style><script>alert(1)</script>"; }' }],
    );
    expect(html.match(/<\/style/gi)).toHaveLength(1);
  });
});
