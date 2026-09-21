import { describe, expect, test } from 'vitest';
import {
  collectBareSpecifiers,
  isBareSpecifier,
  readVersions,
  resolvePackages,
  splitSpecifier,
} from './resolvePackages';

describe('isBareSpecifier', () => {
  test.each(['react', 'react-dom/client', '@tanstack/react-query', 'lodash/debounce'])(
    '%s is a package',
    (specifier) => {
      expect(isBareSpecifier(specifier)).toBe(true);
    },
  );

  test.each(['./a.js', '../b', '/abs.js', 'https://esm.sh/react', 'workspace:a.js', 'node:fs'])(
    '%s is not',
    (specifier) => {
      expect(isBareSpecifier(specifier)).toBe(false);
    },
  );
});

describe('collectBareSpecifiers', () => {
  test('finds static, side-effect and dynamic imports, and re-exports', () => {
    const source = [
      "import { useState } from 'react';",
      "import 'normalize.css';",
      "const m = import('lodash');",
      "export { format } from 'date-fns';",
    ].join('\n');

    expect(collectBareSpecifiers([source]).sort()).toEqual(
      ['date-fns', 'lodash', 'normalize.css', 'react'].sort(),
    );
  });

  test('ignores relative, workspace and URL imports', () => {
    const source = [
      "import a from './a.js';",
      "import b from 'workspace:b.js';",
      "import c from 'https://esm.sh/react@19';",
    ].join('\n');

    expect(collectBareSpecifiers([source])).toEqual([]);
  });

  test('deduplicates across files', () => {
    expect(collectBareSpecifiers(["import 'react';", "import 'react';"])).toEqual(['react']);
  });
});

describe('splitSpecifier', () => {
  test('separates a scoped package from its subpath', () => {
    expect(splitSpecifier('@tanstack/react-query/devtools')).toEqual({
      name: '@tanstack/react-query',
      subpath: '/devtools',
    });
  });

  test('a plain name has no subpath', () => {
    expect(splitSpecifier('react')).toEqual({ name: 'react', subpath: '' });
  });
});

describe('readVersions', () => {
  test('reads dependencies from a workspace package.json', () => {
    const files = [
      { path: 'package.json', content: '{"dependencies":{"react":"18.3.1"},"devDependencies":{"lodash":"4"}}' },
    ];

    expect(readVersions(files)).toEqual({ react: '18.3.1', lodash: '4' });
  });

  test('a malformed manifest is ignored, not fatal', () => {
    expect(readVersions([{ path: 'package.json', content: '{ nope' }])).toEqual({});
  });

  test('no manifest means no pins', () => {
    expect(readVersions([])).toEqual({});
  });
});

describe('resolvePackages', () => {
  test('maps each specifier to esm.sh, keeping its subpath', () => {
    const { imports } = resolvePackages(['lodash', 'lodash/debounce']);

    expect(imports.lodash).toBe('https://esm.sh/lodash@latest');
    expect(imports['lodash/debounce']).toBe('https://esm.sh/lodash@latest/debounce');
  });

  test('adds a prefix entry so a subpath only a dependency imports still resolves', () => {
    const { imports } = resolvePackages(['react']);

    expect(imports['react/']).toBe('https://esm.sh/react@19/');
  });

  test('pins every package to one React, so hooks share a single copy', () => {
    const { imports } = resolvePackages(['react', 'react-dom/client', 'framer-motion']);

    // Any query on react makes esm.sh serve a second, separate build of it.
    expect(imports.react).toBe('https://esm.sh/react@19');
    expect(imports['react-dom/client']).toBe('https://esm.sh/react-dom@19/client?deps=react@19');
    expect(imports['framer-motion']).toBe(
      'https://esm.sh/framer-motion@latest?deps=react@19,react-dom@19',
    );
  });

  test('honours versions from package.json', () => {
    const { imports } = resolvePackages(['react', 'react-dom/client'], {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    });

    expect(imports.react).toBe('https://esm.sh/react@%5E18.3.1');
    expect(imports['react-dom/client']).toBe(
      'https://esm.sh/react-dom@%5E18.3.1/client?deps=react@%5E18.3.1',
    );
  });

  test('leaves packages alone when React is not involved', () => {
    const { imports } = resolvePackages(['lodash']);

    expect(imports.lodash).not.toContain('?deps=');
  });

  test('lists each package once', () => {
    expect(resolvePackages(['react', 'react/jsx-runtime']).packages).toEqual(['react']);
  });
});
