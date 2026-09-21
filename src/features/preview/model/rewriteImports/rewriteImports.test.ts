import {
  collectDependencies,
  directoryOf,
  normaliseSpecifier,
  rewriteImports,
  splitQuery,
} from './rewriteImports';

describe('normaliseSpecifier', () => {
  test('drops the leading ./', () => {
    expect(normaliseSpecifier('./util.js')).toBe('util.js');
  });

  test('resolves a parent hop', () => {
    expect(normaliseSpecifier('../lib/math.js')).toBe('lib/math.js');
  });

  test('keeps nested paths', () => {
    expect(normaliseSpecifier('./lib/deep/a.js')).toBe('lib/deep/a.js');
  });

  test('resolves against the directory it was written in', () => {
    expect(normaliseSpecifier('./Button.js', 'src/components')).toBe('src/components/Button.js');
    expect(normaliseSpecifier('../lib/math.js', 'src/components')).toBe('src/lib/math.js');
  });

  test('clamps a climb above the project root at the root', () => {
    expect(normaliseSpecifier('../../../x.js', 'src')).toBe('x.js');
  });

  test('drops a trailing slash, so a folder has one spelling', () => {
    expect(normaliseSpecifier('./components/', 'src')).toBe('src/components');
    expect(normaliseSpecifier('./components', 'src')).toBe('src/components');
  });

  test('a bare dot names the directory itself', () => {
    expect(normaliseSpecifier('..', 'src/components')).toBe('src');
    expect(normaliseSpecifier('.', 'src/components')).toBe('src/components');
  });
});

describe('directoryOf', () => {
  test('is empty at the root', () => {
    expect(directoryOf('main.js')).toBe('');
  });

  test('drops the file name', () => {
    expect(directoryOf('src/components/Card.js')).toBe('src/components');
  });
});

describe('rewriteImports', () => {
  test('rewrites a default import', () => {
    expect(rewriteImports("import x from './util.js'", 'main.js'))
      .toBe("import x from 'workspace:util.js'");
  });

  test('rewrites a named import spanning lines', () => {
    const source = "import {\n  a,\n  b,\n} from './lib/math.js';";
    expect(rewriteImports(source, 'main.js')).toContain("'workspace:lib/math.js'");
  });

  test('rewrites a side-effect import', () => {
    expect(rewriteImports("import './styles.js';", 'main.js'))
      .toBe("import 'workspace:styles.js';");
  });

  test('rewrites a dynamic import', () => {
    expect(rewriteImports("const m = await import('./lazy.js')", 'main.js'))
      .toContain("import('workspace:lazy.js')");
  });

  test('rewrites a re-export', () => {
    expect(rewriteImports("export { sum } from './math.js'", 'main.js'))
      .toBe("export { sum } from 'workspace:math.js'");
  });

  test('leaves bare package specifiers alone', () => {
    // These have no file behind them, so they must reach the import map as-is
    // and fail loudly rather than being silently pointed at nothing.
    expect(rewriteImports("import React from 'react'", 'main.js'))
      .toBe("import React from 'react'");
  });

  test('leaves absolute URLs alone', () => {
    const source = "import { x } from 'https://esm.sh/x'";
    expect(rewriteImports(source, 'main.js')).toBe(source);
  });

  test('rewrites every import in a file', () => {
    const source = "import a from './a.js';\nimport b from './b.js';";
    const output = rewriteImports(source, 'main.js');
    expect(output).toContain('workspace:a.js');
    expect(output).toContain('workspace:b.js');
  });
});

describe('rewriteImports from a nested module', () => {
  const from = 'src/components/Card.js';

  test('resolves a sibling next to the importer, not at the root', () => {
    expect(rewriteImports("import { Button } from './Button';", from))
      .toBe("import { Button } from 'workspace:src/components/Button';");
  });

  test('resolves a parent-relative import', () => {
    expect(rewriteImports("import { sum } from '../lib/math.js';", from))
      .toBe("import { sum } from 'workspace:src/lib/math.js';");
  });

  test('clamps an import that climbs above the root', () => {
    expect(rewriteImports("import x from '../../../../x.js';", from))
      .toBe("import x from 'workspace:x.js';");
  });

  test('rewrites a folder import, trailing slash or not', () => {
    expect(rewriteImports("import a from './icons';", from)).toContain("'workspace:src/components/icons'");
    expect(rewriteImports("import a from './icons/';", from)).toContain("'workspace:src/components/icons'");
  });

  test('rewrites a bare parent-folder import', () => {
    expect(rewriteImports("import all from '..';", from))
      .toBe("import all from 'workspace:src';");
  });

  test('rewrites a dynamic import relative to the importer', () => {
    expect(rewriteImports("import('../pages/Home.js')", from))
      .toBe("import('workspace:src/pages/Home.js')");
  });

  test('only touches the relative specifier when a package import precedes it', () => {
    const source = "import React from 'react';\nimport { a } from './a.js';";
    expect(rewriteImports(source, from))
      .toBe("import React from 'react';\nimport { a } from 'workspace:src/components/a.js';");
  });

  test('keeps the quote style it was written with', () => {
    expect(rewriteImports('import a from "./a.js";', from))
      .toBe('import a from "workspace:src/components/a.js";');
  });
});

describe('collectDependencies', () => {
  test('resolves against the importer\'s directory', () => {
    const source = "import a from './a.js';\nimport b from '../b.js';";
    expect(collectDependencies(source, 'src/x/main.js').sort())
      .toEqual(['src/b.js', 'src/x/a.js']);
  });

  test('lists what a module imports', () => {
    const source = "import a from './a.js';\nimport './b.js';";
    expect(collectDependencies(source, 'main.js').sort()).toEqual(['a.js', 'b.js']);
  });

  test('deduplicates repeated specifiers', () => {
    const source = "import {a} from './a.js';\nimport {b} from './a.js';";
    expect(collectDependencies(source, 'main.js')).toEqual(['a.js']);
  });

  test('ignores packages', () => {
    expect(collectDependencies("import React from 'react'", 'main.js')).toEqual([]);
  });
});

describe('root-absolute specifiers', () => {
  test('resolve from the project root, wherever the importer is', () => {
    expect(normaliseSpecifier('/vite.svg', 'src/components')).toBe('vite.svg');
    expect(rewriteImports("import viteLogo from '/vite.svg'", 'src/App.js'))
      .toBe("import viteLogo from 'workspace:vite.svg'");
    expect(rewriteImports("import('/src/lazy.js')", 'src/deep/a.js'))
      .toBe("import('workspace:src/lazy.js')");
  });

  test('are collected as dependencies', () => {
    expect(collectDependencies("import './index.css'; import x from '/src/x.json';", 'src/main.js').sort())
      .toEqual(['src/index.css', 'src/x.json']);
  });

  test('a protocol-relative URL is not a path', () => {
    const source = "import x from '//cdn.example/x.js'";
    expect(rewriteImports(source, 'main.js')).toBe(source);
    expect(collectDependencies(source, 'main.js')).toEqual([]);
  });
});

describe('import queries', () => {
  test('a ?query or #hash is kept, and never normalised as path segments', () => {
    expect(normaliseSpecifier('./logo.svg?react', 'src')).toBe('src/logo.svg?react');
    expect(normaliseSpecifier('../a.css?inline', 'src/ui')).toBe('src/a.css?inline');
    expect(normaliseSpecifier('./a.js?x=a/../b', 'src')).toBe('src/a.js?x=a/../b');
    expect(collectDependencies("import L from './logo.svg?react';", 'src/main.js')).toEqual(['src/logo.svg?react']);
  });

  test('splitQuery separates the path from its query', () => {
    expect(splitQuery('src/a.svg?url')).toEqual({ path: 'src/a.svg', query: '?url' });
    expect(splitQuery('src/a.svg')).toEqual({ path: 'src/a.svg', query: '' });
  });
});
