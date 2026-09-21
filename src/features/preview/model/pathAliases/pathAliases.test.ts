import {
  applyPathAliases,
  parseJsonWithComments,
  readPathAliases,
  resolvePathAlias,
} from './pathAliases';

const file = (path: string, content = '') => ({ path, content });

describe('readPathAliases', () => {
  test('reads compilerOptions.paths from a commented tsconfig', () => {
    const aliases = readPathAliases([
      file('tsconfig.app.json', `{
        // Vite's template puts paths here
        "compilerOptions": {
          "baseUrl": ".",
          "paths": { "@/*": ["./src/*"], "#utils": ["src/lib/utils.ts"], },
        },
      }`),
      file('src/main.ts'),
    ]);

    expect(aliases).toEqual([
      { prefix: '@/', wildcard: true, target: 'src/' },
      { prefix: '#utils', wildcard: false, target: 'src/lib/utils.ts' },
    ]);
  });

  test('never turns "*" into an alias for every package', () => {
    expect(readPathAliases([
      file('tsconfig.json', '{"compilerOptions":{"paths":{"*":["./src/*"],"~lib/*":["lib/*"]}}}'),
    ])).toEqual([{ prefix: '~lib/', wildcard: true, target: 'lib/' }]);
  });

  test('falls back to @/ -> src/ when nothing is configured and there is a src folder', () => {
    expect(resolvePathAlias('@/a', readPathAliases([file('src/a.ts')]))).toBe('/src/a');
    expect(readPathAliases([file('a.ts')])).toEqual([]);
  });

  test('ignores an unreadable config', () => {
    expect(readPathAliases([file('tsconfig.json', '{ nope'), file('lib.ts')])).toEqual([]);
  });
});

describe('parseJsonWithComments', () => {
  test('keeps // inside strings', () => {
    expect(parseJsonWithComments('{"u": "https://x" /* c */}')).toEqual({ u: 'https://x' });
  });
});

describe('applyPathAliases', () => {
  const aliases = readPathAliases([file('src/main.ts')]);

  test('rewrites every import shape, and leaves scoped packages alone', () => {
    const source = [
      "import { Button } from '@/components/Button';",
      "import '@/index.css';",
      "const Lazy = () => import('@/pages/Lazy');",
      "export * from '@/lib';",
      "import { x } from '@scope/pkg';",
    ].join('\n');

    expect(applyPathAliases(source, aliases)).toBe([
      "import { Button } from '/src/components/Button';",
      "import '/src/index.css';",
      "const Lazy = () => import('/src/pages/Lazy');",
      "export * from '/src/lib';",
      "import { x } from '@scope/pkg';",
    ].join('\n'));
  });

  test('the longest prefix wins', () => {
    const nested = [
      { prefix: '@/', wildcard: true, target: 'src/' },
      { prefix: '@/ui/', wildcard: true, target: 'packages/ui/' },
    ];
    expect(resolvePathAlias('@/ui/Button', nested)).toBe('/packages/ui/Button');
  });
});
