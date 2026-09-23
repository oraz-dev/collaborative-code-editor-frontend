import { describe, expect, test } from 'vitest';
import { createFileStream, parseProjectJson, type ProjectFile } from './streamJson';

/**
 * A real generation's shape: HTML with quotes and slashes, a package.json
 * whose *content* contains `"name"` (so lenient recovery must not read it as
 * the project's name), and TypeScript with braces, an escaped quote and a
 * `\u` escape inside a string.
 */
const PROJECT = {
  name: 'Tiny Tailwind App',
  summary: 'A bare React 19 page styled with Tailwind from the CDN.',
  files: [
    {
      path: 'index.html',
      content: '<!doctype html>\n<html>\n  <head><script src="https://cdn.tailwindcss.com"></script></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>\n',
    },
    {
      path: 'package.json',
      content: '{\n  "name": "tiny-app",\n  "dependencies": {\n    "react": "^19.2.6"\n  }\n}\n',
    },
    {
      path: 'src/main.tsx',
      content: 'const label = "café \\u0041 { } \\" ";\nexport const App = () => <p className="p-4">{label}</p>;\n',
    },
  ],
};

const TEXT = JSON.stringify(PROJECT);
const PATHS = PROJECT.files.map((file) => file.path);

/** Feeds the text in fixed-size pieces, so boundaries fall everywhere. */
function pushAll(text: string, size: number, limits = {}) {
  const stream = createFileStream(limits);
  const emitted: ProjectFile[] = [];
  let status = 'ok';
  let reason: string | null = null;

  for (let index = 0; index < text.length; index += size) {
    const result = stream.push(text.slice(index, index + size));
    emitted.push(...result.files);
    status = result.status;
    reason = result.reason;
  }

  return { stream, emitted, status, reason };
}

describe('createFileStream', () => {
  test.each([1, 2, 3, 5, 13, 101, 100_000])('emits every file once, in order, in %i-char chunks', (size) => {
    const { emitted, stream } = pushAll(TEXT, size);

    expect(emitted).toEqual(PROJECT.files);
    expect(stream.finish()).toMatchObject({
      truncated: false,
      status: 'ok',
      name: 'Tiny Tailwind App',
      summary: PROJECT.summary,
      incompletePath: null,
    });
  });

  test('a file is emitted as soon as its object closes, not at the end', () => {
    const stream = createFileStream();
    const head = TEXT.slice(0, TEXT.indexOf('"package.json"'));

    expect(stream.push(head).files.map((file) => file.path)).toEqual(['index.html']);
  });

  test('keys may arrive in any order, with whitespace between them', () => {
    const text = `{\n  "files" : [\n    {\n      "content" : "export const a = 1;\\n" ,\n      "path"\n : "src/a.ts"\n    }\n  ],\n  "name": "Out Of Order"\n}`;
    const { emitted, stream } = pushAll(text, 4);

    expect(emitted).toEqual([{ path: 'src/a.ts', content: 'export const a = 1;\n' }]);
    expect(stream.finish().name).toBe('Out Of Order');
  });

  test('unicode escapes and braces inside strings survive the scan', () => {
    const { emitted } = pushAll(TEXT, 1);

    expect(emitted[2].content).toBe(PROJECT.files[2].content);
    expect(emitted[2].content).toContain('café');
    expect(emitted[2].content).toContain('\\u0041');
    expect(emitted[2].content).toContain('\\" ');
  });

  test('reads the files out of a chatty model\'s fenced answer', () => {
    const text = `Sure! Here is the project:\n\n\`\`\`json\n${TEXT}\n\`\`\`\n\nLet me know if you want more.`;
    const { emitted, stream } = pushAll(text, 7);

    expect(emitted.map((file) => file.path)).toEqual(PATHS);
    expect(stream.finish().truncated).toBe(false);
  });

  test('accepts a bare array of files', () => {
    const { emitted } = pushAll(JSON.stringify(PROJECT.files), 9);

    expect(emitted).toEqual(PROJECT.files);
  });

  test('a chunk passed to finish is scanned too', () => {
    const stream = createFileStream();
    const split = TEXT.length - 20;
    stream.push(TEXT.slice(0, split));

    const result = stream.finish(TEXT.slice(split));

    expect(result.files.map((file) => file.path)).toEqual(PATHS);
    expect(result.truncated).toBe(false);
  });
});

describe('truncated responses', () => {
  // Cut while the third file is being written: the object never closes. The
  // path key is matched, not the name, which also appears inside index.html.
  const CUT = TEXT.slice(0, TEXT.indexOf('"path":"src/main.tsx"') + 40);

  test.each([1, 6, 50])('keeps the completed files, in %i-char chunks', (size) => {
    const { stream } = pushAll(CUT, size);
    const result = stream.finish();

    expect(result.files.map((file) => file.path)).toEqual(['index.html', 'package.json']);
    expect(result.truncated).toBe(true);
    expect(result.status).toBe('ok');
  });

  test('names the file it was cut off inside, so the rest can be asked for', () => {
    const { stream } = pushAll(CUT, 11);

    expect(stream.finish().incompletePath).toBe('src/main.tsx');
  });

  test('recovers the project name from the header, not from a package.json', () => {
    const { stream } = pushAll(CUT, 11);
    const result = stream.finish();

    expect(result.name).toBe('Tiny Tailwind App');
    expect(result.summary).toBe(PROJECT.summary);
  });

  test('a response cut before any file closes loses nothing that existed', () => {
    const { stream } = pushAll(TEXT.slice(0, TEXT.indexOf('index.html') + 5), 3);
    const result = stream.finish();

    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(true);
  });
});

describe('repetition guard', () => {
  const LOOPED = JSON.stringify({
    name: 'Looped',
    summary: 'The model repeated itself.',
    files: [PROJECT.files[0], PROJECT.files[1], PROJECT.files[0], PROJECT.files[0]],
  });

  test('reports looping the moment a path comes back', () => {
    const { emitted, status, reason } = pushAll(LOOPED, 17);

    expect(emitted.map((file) => file.path)).toEqual(['index.html', 'package.json']);
    expect(status).toBe('looping');
    expect(reason).toContain('index.html');
  });

  test('stays stopped, and keeps what it had', () => {
    const { stream } = pushAll(LOOPED, 17);

    expect(stream.push('anything at all').files).toEqual([]);
    expect(stream.push('anything at all').status).toBe('looping');
    expect(stream.finish().files.map((file) => file.path)).toEqual(['index.html', 'package.json']);
    expect(stream.finish().status).toBe('looping');
  });

  test('caps the code it will accept', () => {
    const { status, reason } = pushAll(TEXT, 64, { maxBytes: 100 });

    expect(status).toBe('looping');
    expect(reason).toContain('100 characters of code');
  });

  test('caps the number of files', () => {
    const many = JSON.stringify({
      files: Array.from({ length: 6 }, (_, index) => ({ path: `src/f${index}.ts`, content: '' })),
    });
    const { status, reason } = pushAll(many, 31, { maxFiles: 3 });

    expect(status).toBe('looping');
    expect(reason).toContain('3 files');
  });

  test('catches a loop inside one never-closing file', () => {
    const stream = createFileStream({ maxBuffer: 500 });
    // 177KB of one repeating string is the failure this exists for; no object
    // ever closes, so the repeated-path guard cannot see it.
    const result = stream.push(`{"files":[{"path":"src/App.tsx","content":"${'x'.repeat(600)}`);

    expect(result.status).toBe('looping');
    expect(result.reason).toContain('500 characters');
  });

  test('keeps a file that closed inside the chunk that tripped the guard', () => {
    const stream = createFileStream({ maxBuffer: 60 });
    const result = stream.push(
      `{"files":[{"path":"a.ts","content":"1"},{"path":"b.ts","content":"${'x'.repeat(80)}`,
    );

    expect(result.files.map((file) => file.path)).toEqual(['a.ts']);
    expect(result.status).toBe('looping');
  });

  test('catches one file looping inside its own string, whatever the buffer holds', () => {
    // The guard that has to work at the shipped token budget: the whole
    // response never comes near `maxBuffer`, but one file does run on.
    const stream = createFileStream({ maxStringChars: 2_000 });
    const result = stream.push(`{"files":[{"path":"a.ts","content":"1"},{"path":"src/App.tsx","content":"${'export const A = 1;\\n'.repeat(200)}`);

    expect(result.files.map((file) => file.path)).toEqual(['a.ts']);
    expect(result.status).toBe('looping');
    expect(result.reason).toContain('2000 characters');
  });

  test('the default guards are reachable within one generation', () => {
    // 24k tokens is roughly 100k characters, so a guard above that can never
    // fire — which is how the 177KB loop ran to the cap unnoticed.
    const stream = createFileStream();
    const result = stream.push(`{"files":[{"path":"src/App.tsx","content":"${'export const A = 1;\\n'.repeat(5_000)}`);

    expect(result.status).toBe('looping');
    expect(result.reason).toContain('50000 characters');
  });

  test('stops on text nested far deeper than a file list', () => {
    const result = createFileStream().push('['.repeat(70));

    expect(result.status).toBe('looping');
    expect(result.reason).toContain('nested');
  });
});

describe('pending', () => {
  test('names the file being written, and nothing between files', () => {
    const stream = createFileStream();
    expect(stream.pending).toBeNull();

    stream.push(TEXT.slice(0, TEXT.indexOf('"content"')));
    expect(stream.pending).toBe('index.html');

    // Up to just after the first file's object closes: nothing is open.
    const afterFirst = TEXT.indexOf('"package.json"');
    stream.push(TEXT.slice(stream.text.length, TEXT.lastIndexOf('{', afterFirst)));
    expect(stream.pending).toBeNull();
  });

  test('is null while the open file is still unnamed, and when content comes first', () => {
    const stream = createFileStream();
    stream.push('{"files":[{');
    expect(stream.pending).toBeNull();

    stream.push('"content":"const a = 1;","path":"src/a.ts"');
    expect(stream.pending).toBe('src/a.ts');
  });

  test('a truncated response reports the same path as incompletePath', () => {
    const stream = createFileStream();
    // From the *last* mention: "/src/main.tsx" also appears inside index.html.
    stream.push(TEXT.slice(0, TEXT.indexOf('"content"', TEXT.lastIndexOf('src/main.tsx')) + 20));
    const pending = stream.pending;

    expect(pending).toBe('src/main.tsx');
    expect(stream.finish().incompletePath).toBe(pending);
  });
});

describe('objects that are not files', () => {
  /** The shape from the prompt, which a prompt-JSON model restates before answering. */
  const SHAPE = '{"name":"...","summary":"...","files":[{"path":"...","content":"..."}]}';

  test('an example object in the prose is not a file, and does not trip the loop guard', () => {
    const text = `I will answer with one object per file, like {"path": "index.html", "content": "<!doctype html>..."}.\n${TEXT}`;
    const { emitted, status, stream } = pushAll(text, 13);

    expect(emitted.map((file) => file.path)).toEqual(PATHS);
    expect(emitted[0].content).toBe(PROJECT.files[0].content);
    expect(status).toBe('ok');
    expect(stream.finish().truncated).toBe(false);
  });

  test('a recap after the answer is not a second copy of the file', () => {
    const text = `${TEXT}\n\nAs a reminder, the entry is {"path":"index.html","content":"H"}.`;
    const { emitted, status, stream } = pushAll(text, 29);

    expect(emitted.map((file) => file.path)).toEqual(PATHS);
    expect(status).toBe('ok');
    expect(stream.finish()).toMatchObject({ status: 'ok', truncated: false });
  });

  test('the answer shape, restated, does not become a document called "..."', () => {
    const { emitted, stream } = pushAll(`Answer shape: ${SHAPE}\n${TEXT}`, 7);

    expect(emitted.map((file) => file.path)).toEqual(PATHS);
    expect(stream.finish().files.map((file) => file.path)).toEqual(PATHS);
    expect(parseProjectJson(SHAPE)?.files).toEqual([]);
  });
});

describe('prose around the answer', () => {
  test('an odd quote in the prose does not swallow the response', () => {
    const text = `Here is your "project:\n${TEXT}`;
    const { emitted, stream } = pushAll(text, 17);

    expect(emitted.map((file) => file.path)).toEqual(PATHS);
    expect(stream.finish().truncated).toBe(false);
  });

  test('and still keeps the completed files when such an answer is cut off', () => {
    const text = `Here is your "project:\n${TEXT}`;
    const { stream } = pushAll(text.slice(0, text.length - 30), 17);
    const result = stream.finish();

    expect(result.files.map((file) => file.path)).toEqual(['index.html', 'package.json']);
    expect(result.truncated).toBe(true);
  });

  test('a complete answer wrapped in prose is not reported as cut off', () => {
    const fenced = `Here you go:\n\`\`\`json\n${JSON.stringify(PROJECT.files)}\n\`\`\`\nEnjoy!`;
    const braced = `I will start each file with a \`{\` character.\n${TEXT}`;

    expect(pushAll(fenced, 11).stream.finish()).toMatchObject({ truncated: false });
    expect(pushAll(braced, 11).stream.finish()).toMatchObject({ truncated: false, name: PROJECT.name });
    expect(parseProjectJson(fenced)?.files).toEqual(PROJECT.files);
    expect(parseProjectJson(braced)?.files).toEqual(PROJECT.files);
  });
});

describe('parseProjectJson', () => {
  test('parses a plain object', () => {
    expect(parseProjectJson(TEXT)).toEqual({
      name: PROJECT.name,
      summary: PROJECT.summary,
      files: PROJECT.files,
    });
  });

  test('parses one wrapped in a fence and prose', () => {
    expect(parseProjectJson(`Here you go:\n\`\`\`json\n${TEXT}\n\`\`\``)?.files).toEqual(PROJECT.files);
  });

  test('drops entries that are not files', () => {
    const text = JSON.stringify({ files: [{ path: 'a.ts' }, { path: 'b.ts', content: '' }, 'c.ts'] });

    expect(parseProjectJson(text)?.files).toEqual([{ path: 'b.ts', content: '' }]);
  });

  test('answers null for anything that is not JSON', () => {
    expect(parseProjectJson('I could not write that project.')).toBeNull();
    expect(parseProjectJson('')).toBeNull();
  });
});
