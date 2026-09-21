import { describe, expect, test } from 'vitest';
import {
  compilerOptions,
  jsonDeclaration,
  jsonType,
  projectLibs,
  projectUri,
  untypedPackagesDeclaration,
} from './editorLibs';

describe('compilerOptions', () => {
  test('compiles like Vite’s React template: JSX, bundler resolution', () => {
    const options = compilerOptions({ key: 'p1', paths: {}, strict: false });

    expect(options.jsx).toBe(4); // react-jsx
    expect(options.moduleResolution).toBe(100); // bundler
    expect(options.allowArbitraryExtensions).toBe(true);
    expect(options).not.toHaveProperty('baseUrl');
  });

  test('path aliases resolve from the project root', () => {
    const options = compilerOptions({ key: 'p1', paths: { '@/*': ['src/*'] }, strict: true });

    expect(options.baseUrl).toBe('file:///p/p1/');
    expect(options.paths).toEqual({ '@/*': ['src/*'] });
    expect(options.strict).toBe(true);
  });
});

describe('projectUri', () => {
  test('keeps a key with odd characters inside one path segment', () => {
    expect(projectUri('a/b', 'src/App.tsx')).toBe('file:///p/a%2Fb/src/App.tsx');
  });
});

describe('jsonType', () => {
  test('writes out the inferred type', () => {
    expect(jsonType({ name: 'x', tags: ['a'], n: 1, ok: true, none: null, 'odd-key': 2 }))
      .toBe('{ name: string; tags: string[]; n: number; ok: boolean; none: null; "odd-key": number; }');
  });

  test('mixed and empty arrays', () => {
    expect(jsonType([1, 'a'])).toBe('(number | string)[]');
    expect(jsonType([])).toBe('unknown[]');
  });
});

describe('jsonDeclaration', () => {
  test('a default export plus named exports for valid top-level keys', () => {
    const declaration = jsonDeclaration('{"version":"1","default":2,"odd-key":3}');

    expect(declaration).toContain('export default value;');
    expect(declaration).toContain('export declare const version: string;');
    // Reserved words and non-identifiers can only be reached through the default.
    expect(declaration).not.toContain('const default');
    expect(declaration).not.toContain('odd-key:');
  });

  test('invalid JSON declares an untyped default, not a pile of errors', () => {
    expect(jsonDeclaration('{ nope')).toBe('declare const value: any;\nexport default value;\n');
  });
});

describe('untypedPackagesDeclaration', () => {
  test('declares the package and its subpaths as untyped modules', () => {
    expect(untypedPackagesDeclaration(['zustand'])).toBe("declare module 'zustand';\ndeclare module 'zustand/*';");
  });
});

describe('projectLibs', () => {
  const files = [
    { path: 'src/App.tsx', content: 'app' },
    { path: 'src/util.ts', content: 'util' },
    { path: 'src/data/team.json', content: '{"a":1}' },
    { path: 'src/App.css', content: '.x{}' },
  ];

  test('publishes the other scripts at their project URIs, leaving the open file to its model', () => {
    const libs = projectLibs('k', files, 'src/App.tsx');

    expect(libs.get('file:///p/k/src/util.ts')).toBe('util');
    expect(libs.has('file:///p/k/src/App.tsx')).toBe(false);
  });

  test('types a JSON file through a .d.json.ts beside it', () => {
    const libs = projectLibs('k', files, 'src/App.tsx');

    expect(libs.get('file:///p/k/src/data/team.d.json.ts')).toContain('export declare const a: number;');
    expect(libs.has('file:///p/k/src/data/team.json')).toBe(false);
  });

  test('leaves stylesheets to the ambient declarations', () => {
    expect([...projectLibs('k', files, 'src/App.tsx').keys()].some((uri) => uri.endsWith('.css'))).toBe(false);
  });
});
