import { describe, expect, test } from 'vitest';
import {
  acquireTypes,
  entryDeclarations,
  PACKAGE_CDN,
  REGISTRY_API,
  resolveDeclaration,
  scanImports,
  stripComments,
  typesPackageName,
  type TypeFetcher,
} from './acquireTypes';

interface FakePackage {
  version: string;
  manifest: Record<string, unknown>;
  files: Record<string, string>;
}

/** A registry in memory: resolve, flat listing, and file contents, as jsDelivr answers them. */
function fakeRegistry(packages: Record<string, FakePackage>) {
  const requested: string[] = [];
  const fetcher: TypeFetcher = {
    async text(url) {
      requested.push(url);
      const resolve = url.match(new RegExp(`^${REGISTRY_API}/(.+)/resolved\\?specifier=`));
      if (resolve) {
        const pkg = packages[resolve[1]];
        if (!pkg) throw new Error('404');
        return JSON.stringify({ version: pkg.version });
      }
      const listing = url.match(new RegExp(`^${REGISTRY_API}/(.+)@([^@?]+)\\?structure=flat$`));
      if (listing) {
        const pkg = packages[listing[1]];
        return JSON.stringify({ files: Object.keys(pkg.files).map((name) => ({ name: `/${name}` })) });
      }
      const file = url.match(new RegExp(`^${PACKAGE_CDN}/(.+)@([^@/]+)/(.+)$`));
      if (file) {
        const pkg = packages[file[1]];
        if (file[3] === 'package.json') return JSON.stringify(pkg.manifest);
        const content = pkg?.files[file[3]];
        if (content === undefined) throw new Error('404');
        return content;
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  return { fetcher, requested };
}

describe('scanImports', () => {
  test('finds imports, re-exports, type imports and references', () => {
    const source = [
      '/// <reference types="node" />',
      '/// <reference path="global.d.ts" />',
      "import * as CSS from 'csstype';",
      'export * from "./add.ts";',
      'export {\n  a,\n  b,\n} from "./multi.js";',
      "type T = import('./lazy').T;",
    ].join('\n');

    expect(scanImports(source).sort()).toEqual(
      ['./add.ts', './global.d.ts', './lazy', './multi.js', 'csstype', 'node'].sort(),
    );
  });

  test('ignores JSDoc examples', () => {
    const source = "/**\n * @example\n * import { format } from 'date-fns'\n */\nexport declare function f(): void;";
    expect(scanImports(source)).toEqual([]);
  });
});

describe('stripComments', () => {
  test('keeps strings that look like comments', () => {
    expect(stripComments("const u = 'http://x'; // gone")).toBe("const u = 'http://x'; ");
  });
});

describe('resolveDeclaration', () => {
  const files = new Set(['add.d.ts', 'esm/index.d.mts', 'lib/index.d.ts']);

  test.each([
    ['index.d.ts', './add.ts', 'add.d.ts'],
    ['index.d.ts', './add.js', 'add.d.ts'],
    ['index.d.ts', './add', 'add.d.ts'],
    ['index.d.ts', './esm/index.mjs', 'esm/index.d.mts'],
    ['index.d.ts', './lib', 'lib/index.d.ts'],
    ['lib/index.d.ts', '../add.js', 'add.d.ts'],
  ])('from %s, %s is %s', (from, specifier, expected) => {
    expect(resolveDeclaration(from, specifier, files)).toBe(expected);
  });

  test('null when the package has no such declaration', () => {
    expect(resolveDeclaration('index.d.ts', './missing', files)).toBeNull();
  });
});

describe('entryDeclarations', () => {
  const files = new Set(['index.d.ts', 'client.d.ts', 'ts5.0/index.d.ts', 'index.d.cts', 'esm/index.d.mts']);

  test('reads `types` under exports, skipping old-compiler and CommonJS twins', () => {
    const manifest = {
      exports: {
        '.': {
          'types@<=5.0': { default: './ts5.0/index.d.ts' },
          require: { types: './index.d.cts' },
          import: { types: './esm/index.d.mts', default: './esm/index.mjs' },
        },
      },
    };
    expect(entryDeclarations(manifest, '', files)).toEqual(['esm/index.d.mts', 'index.d.ts']);
  });

  test('a subpath, exact or through a wildcard', () => {
    expect(entryDeclarations({ exports: { './client': { types: './client.d.ts' } } }, 'client', files))
      .toEqual(['client.d.ts']);
    expect(entryDeclarations({ exports: { './*': { types: './*.d.ts' } } }, 'client', files))
      .toEqual(['client.d.ts']);
  });

  test('falls back to `types`, then index.d.ts, without exports', () => {
    expect(entryDeclarations({ types: 'index.d.ts' }, '', files)).toEqual(['index.d.ts']);
    expect(entryDeclarations({}, '', files)).toEqual(['index.d.ts']);
  });
});

describe('typesPackageName', () => {
  test('mangles scoped names the DefinitelyTyped way', () => {
    expect(typesPackageName('react')).toBe('@types/react');
    expect(typesPackageName('@scope/pkg')).toBe('@types/scope__pkg');
  });
});

describe('acquireTypes', () => {
  const registry = {
    react: {
      version: '19.2.0',
      manifest: { name: 'react', main: 'index.js' },
      files: { 'index.js': '' },
    },
    '@types/react': {
      version: '19.2.2',
      manifest: {
        name: '@types/react',
        dependencies: { csstype: '^3.1.0' },
        exports: { '.': { types: './index.d.ts' }, './jsx-runtime': { types: './jsx-runtime.d.ts' } },
      },
      files: {
        'index.d.ts': "import * as CSS from 'csstype';\nexport * from './hooks';",
        'hooks.d.ts': 'export declare function useState<T>(v: T): [T, (v: T) => void];',
        'jsx-runtime.d.ts': "import './index';",
        'unused.d.ts': 'never fetched',
      },
    },
    csstype: {
      version: '3.1.3',
      manifest: { name: 'csstype', types: 'index.d.ts' },
      files: { 'index.d.ts': 'export interface Properties {}' },
    },
  };

  test('falls back to @types, follows imports and dependencies, and fetches nothing unreachable', async () => {
    const { fetcher, requested } = fakeRegistry(registry);
    const result = await acquireTypes([{ name: 'react', range: '19', subpaths: ['jsx-runtime'] }], fetcher);
    const paths = result.files.map((file) => file.path).sort();

    expect(result.typed).toEqual(['react']);
    expect(paths).toEqual([
      'node_modules/@types/react/hooks.d.ts',
      'node_modules/@types/react/index.d.ts',
      'node_modules/@types/react/jsx-runtime.d.ts',
      'node_modules/@types/react/package.json',
      'node_modules/csstype/index.d.ts',
      'node_modules/csstype/package.json',
    ]);
    expect(requested.some((url) => url.endsWith('unused.d.ts'))).toBe(false);
    // The dependency's range comes from the manifest that depends on it.
    expect(requested).toContain(`${REGISTRY_API}/csstype/resolved?specifier=%5E3.1.0`);
  });

  test('react’s own manifest, which has no types, is not registered to shadow @types/react', async () => {
    const { fetcher } = fakeRegistry(registry);
    const result = await acquireTypes([{ name: 'react', range: '19' }], fetcher);

    expect(result.files.some((file) => file.path === 'node_modules/react/package.json')).toBe(false);
  });

  test('a package that cannot be found is simply not typed', async () => {
    const { fetcher } = fakeRegistry(registry);
    const result = await acquireTypes([{ name: 'no-such-package', range: '' }], fetcher);

    expect(result.typed).toEqual([]);
    expect(result.files).toEqual([]);
  });

  test('reports progress: where the types come from, and files done against files found', async () => {
    const { fetcher } = fakeRegistry(registry);
    const events: { source: string | null; filesDone: number; filesFound: number }[] = [];
    await acquireTypes([{ name: 'react', range: '19' }], fetcher, { onProgress: (event) => events.push(event) });

    const last = events[events.length - 1];
    expect(last.source).toBe('@types/react');
    expect(last.filesDone).toBe(last.filesFound);
    expect(last.filesFound).toBeGreaterThan(0);
    // Counts only ever grow.
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index].filesFound).toBeGreaterThanOrEqual(events[index - 1].filesFound);
      expect(events[index].filesDone).toBeGreaterThanOrEqual(events[index - 1].filesDone);
    }
  });
});
