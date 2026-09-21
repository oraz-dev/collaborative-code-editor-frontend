import { describe, expect, test } from 'vitest';
import { JUDGE0_LANGUAGES } from './judge0Fixture';
import { extensionOf, resolveLanguage } from './resolveLanguage';

describe('extensionOf', () => {
  test('reads the extension, lowercased', () => {
    expect(extensionOf('main.PY')).toBe('py');
    expect(extensionOf('src/lib/util.go')).toBe('go');
  });

  test('a dotfile has no extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('Makefile')).toBe('');
  });

  test('only the last dot counts', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });
});

describe('resolveLanguage against the deployed Judge0 list', () => {
  const resolve = (name: string) => resolveLanguage(name, JUDGE0_LANGUAGES);

  test.each([
    ['main.py', 71, 'Python (3.8.1)'],
    ['main.go', 60, 'Go (1.13.5)'],
    ['main.rs', 73, 'Rust (1.40.0)'],
    ['Main.java', 62, 'Java (OpenJDK 13.0.1)'],
    ['script.js', 63, 'JavaScript (Node.js 12.14.0)'],
    ['script.ts', 74, 'TypeScript (3.7.4)'],
    ['app.rb', 72, 'Ruby (2.7.0)'],
    ['index.php', 68, 'PHP (7.4.1)'],
    ['query.sql', 82, 'SQL (SQLite 3.27.2)'],
    ['run.sh', 46, 'Bash (5.0.0)'],
  ])('%s resolves to %i', (fileName, id, name) => {
    expect(resolve(fileName)).toEqual({ id, name });
  });

  test('Python prefers 3 over 2, which a plain newest-wins rule gets right only by luck', () => {
    // 2.7.17 has the larger trailing number; comparing as strings or by id
    // would pick it.
    expect(resolve('main.py')?.name).toBe('Python (3.8.1)');
  });

  test('C picks the newest GCC, not the higher id', () => {
    // C (Clang 7.0.1) is id 75; C (GCC 9.2.0) is id 50.
    expect(resolve('main.c')).toEqual({ id: 50, name: 'C (GCC 9.2.0)' });
    expect(resolve('main.cpp')).toEqual({ id: 54, name: 'C++ (GCC 9.2.0)' });
  });

  test('C, C++ and C# are never confused for one another', () => {
    expect(resolve('a.c')?.name).toMatch(/^C \(/);
    expect(resolve('a.cpp')?.name).toMatch(/^C\+\+ \(/);
    expect(resolve('a.cs')?.name).toMatch(/^C#/);
  });

  test('a file the sandbox cannot run resolves to nothing', () => {
    expect(resolve('styles.css')).toBeNull();
    expect(resolve('README.md')).toBeNull();
    expect(resolve('index.html')).toBeNull();
    expect(resolve('Makefile')).toBeNull();
  });
});

describe('resolveLanguage when the deployment has narrowed its list', () => {
  test('falls back to a family that survived the allowlist', () => {
    const onlyClang = [{ id: 75, name: 'C (Clang 7.0.1)' }];
    expect(resolveLanguage('main.c', onlyClang)).toEqual(onlyClang[0]);
  });

  test('falls back to Python 2 when 3 was removed', () => {
    const onlyPython2 = [{ id: 70, name: 'Python (2.7.17)' }];
    expect(resolveLanguage('main.py', onlyPython2)?.id).toBe(70);
  });

  test('returns null rather than guessing when the language is gone', () => {
    expect(resolveLanguage('main.py', [{ id: 60, name: 'Go (1.13.5)' }])).toBeNull();
  });

  test('an empty list means nothing runs, not a crash', () => {
    expect(resolveLanguage('main.py', [])).toBeNull();
  });
});
