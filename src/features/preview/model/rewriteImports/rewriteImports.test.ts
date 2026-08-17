import { collectDependencies, normaliseSpecifier, rewriteImports } from './rewriteImports';

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
});

describe('rewriteImports', () => {
  test('rewrites a default import', () => {
    expect(rewriteImports("import x from './util.js'"))
      .toBe("import x from 'workspace:util.js'");
  });

  test('rewrites a named import spanning lines', () => {
    const source = "import {\n  a,\n  b,\n} from './lib/math.js';";
    expect(rewriteImports(source)).toContain("'workspace:lib/math.js'");
  });

  test('rewrites a side-effect import', () => {
    expect(rewriteImports("import './styles.js';"))
      .toBe("import 'workspace:styles.js';");
  });

  test('rewrites a dynamic import', () => {
    expect(rewriteImports("const m = await import('./lazy.js')"))
      .toContain("import('workspace:lazy.js')");
  });

  test('rewrites a re-export', () => {
    expect(rewriteImports("export { sum } from './math.js'"))
      .toBe("export { sum } from 'workspace:math.js'");
  });

  test('leaves bare package specifiers alone', () => {
    // These have no file behind them, so they must reach the import map as-is
    // and fail loudly rather than being silently pointed at nothing.
    expect(rewriteImports("import React from 'react'"))
      .toBe("import React from 'react'");
  });

  test('leaves absolute URLs alone', () => {
    const source = "import { x } from 'https://esm.sh/x'";
    expect(rewriteImports(source)).toBe(source);
  });

  test('rewrites every import in a file', () => {
    const source = "import a from './a.js';\nimport b from './b.js';";
    const output = rewriteImports(source);
    expect(output).toContain('workspace:a.js');
    expect(output).toContain('workspace:b.js');
  });
});

describe('collectDependencies', () => {
  test('lists what a module imports', () => {
    const source = "import a from './a.js';\nimport './b.js';";
    expect(collectDependencies(source).sort()).toEqual(['a.js', 'b.js']);
  });

  test('deduplicates repeated specifiers', () => {
    const source = "import {a} from './a.js';\nimport {b} from './a.js';";
    expect(collectDependencies(source)).toEqual(['a.js']);
  });

  test('ignores packages', () => {
    expect(collectDependencies("import React from 'react'")).toEqual([]);
  });
});
