import { describe, expect, test } from 'vitest';
import { projectTypeInfo } from './projectTypeInfo';

describe('projectTypeInfo', () => {
  const files = [
    { path: 'package.json', content: '{"dependencies":{"react":"19","date-fns":"4"}}' },
    { path: 'tsconfig.json', content: '{ // comment\n "compilerOptions": { "strict": true, "paths": { "@/*": ["./src/*"] } } }' },
    {
      path: 'src/App.tsx',
      content: [
        "import { format } from 'date-fns';",
        "import { useNow } from '@/hooks/useNow';",
        "import { create } from 'zustand';",
        "import { createRoot } from 'react-dom/client';",
        "import './App.css';",
      ].join('\n'),
    },
    { path: 'src/hooks/useNow.ts', content: "import { useState } from 'react';" },
  ];

  test('lists imported packages with their package.json ranges', () => {
    expect(projectTypeInfo(files).packages).toEqual([
      { name: 'date-fns', range: '4', subpaths: [] },
      { name: 'zustand', range: '', subpaths: [] },
      { name: 'react-dom', range: '', subpaths: ['client'] },
      { name: 'react', range: '19', subpaths: [] },
    ]);
  });

  test('a path alias is the project’s own file, not a package called "@"', () => {
    expect(projectTypeInfo(files).packages.map((pkg) => pkg.name)).not.toContain('@');
  });

  test('turns aliases into tsconfig paths', () => {
    expect(projectTypeInfo(files).paths).toEqual({ '@/*': ['src/*'] });
  });

  test('reads strict from tsconfig, off without one', () => {
    expect(projectTypeInfo(files).strict).toBe(true);
    expect(projectTypeInfo(files.filter((file) => file.path !== 'tsconfig.json')).strict).toBe(false);
  });

  test('a half-written tsconfig is not fatal', () => {
    expect(projectTypeInfo([{ path: 'tsconfig.json', content: '{ "compilerOptions": {' }]).strict).toBe(false);
  });

  test('notices JSX files', () => {
    expect(projectTypeInfo(files).usesJsx).toBe(true);
    expect(projectTypeInfo([{ path: 'a.ts', content: '' }]).usesJsx).toBe(false);
  });
});
