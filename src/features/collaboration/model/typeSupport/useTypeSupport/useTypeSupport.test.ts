import { describe, expect, test } from 'vitest';
import { liveRequests, typeRequests, type EditorProject } from './useTypeSupport';

const project: EditorProject = {
  key: 'k',
  path: 'src/App.tsx',
  files: [],
  packages: [{ name: 'react', range: '19', subpaths: [] }],
  paths: { '@/*': ['src/*'] },
  strict: false,
  usesJsx: true,
};

describe('typeRequests', () => {
  test('a JSX project always asks for React’s JSX runtime', () => {
    expect(typeRequests(project)).toEqual([{ name: 'react', range: '19', subpaths: ['jsx-runtime'] }]);
  });

  test('even when no file imports React', () => {
    expect(typeRequests({ ...project, packages: [] })).toEqual([
      { name: 'react', range: '', subpaths: ['jsx-runtime'] },
    ]);
  });

  test('a project without JSX asks only for what it imports', () => {
    expect(typeRequests({ ...project, usesJsx: false, packages: [] })).toEqual([]);
  });
});

describe('liveRequests', () => {
  test('reads the packages the open file imports now, with the project’s ranges', () => {
    const source = [
      "import { useState } from 'react';",
      "import { motion } from 'framer-motion';",
      "import { createRoot } from 'react-dom/client';",
      "import { useNow } from '@/hooks/useNow';",
      "import './App.css';",
      "import fs from 'node:fs';",
    ].join('\n');

    expect(liveRequests(source, project)).toEqual([
      { name: 'react', range: '19', subpaths: [] },
      { name: 'framer-motion', range: '', subpaths: [] },
      { name: 'react-dom', range: '', subpaths: ['client'] },
    ]);
  });
});
