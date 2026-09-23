import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CreateDocumentInput, WorkspaceDocument } from '@/entities/Document';
import { OpenRouterError, type ChatRequest, type OpenRouterClient } from '../openrouter/openrouter';
import type { ChainModel } from '../modelChain/modelChain';
import type { StreamLimits } from '../streamJson/streamJson';
import type { ProjectPlan } from '../prompts/prompts';
import { describeAttempts, mergeFiles, readPlan, useProjectGenerator } from './useProjectGenerator';

/** A chain of made-up models, so the assertions do not move when the real one does. */
const CHAIN: ChainModel[] = [
  { id: 'alpha:free', label: 'Alpha', structured: true, maxOutput: 32_000, contextLength: 100_000 },
  { id: 'beta:free', label: 'Beta', structured: true, maxOutput: 32_000, contextLength: 100_000 },
  { id: 'gamma:free', label: 'Gamma', structured: false, maxOutput: 32_000, contextLength: 100_000 },
];

const HTML = '<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
const MAIN = 'import { createRoot } from "react-dom/client";\nconst host = document.getElementById("root");\nif (host) createRoot(host).render(<h1>Hi</h1>);\n';
const PACKAGE = JSON.stringify({ name: 'bare', dependencies: { react: '^19.2.0', 'react-dom': '^19.2.0' } });
const PACKAGE_WITH_TAILWIND = JSON.stringify({
  name: 'bare',
  dependencies: { react: '^19.2.0', 'react-dom': '^19.2.0', tailwindcss: '^4.0.0' },
});

const FILES = [
  { path: 'index.html', content: HTML },
  { path: 'package.json', content: PACKAGE },
  { path: 'src/main.tsx', content: MAIN },
];

const PLAN: ProjectPlan = {
  name: 'Bare App',
  summary: 'A bare React 19 page.',
  files: [
    { path: 'index.html', purpose: 'The page' },
    { path: 'package.json', purpose: 'Dependencies' },
    { path: 'src/main.tsx', purpose: 'The entry' },
  ],
};

function projectJson(files: { path: string; content: string }[], name = 'Bare App'): string {
  return JSON.stringify({ name, summary: 'A bare React 19 page.', files });
}

/** Chunks that each complete a file, the way a real stream tends to land. */
function chunksOf(text: string): string[] {
  return text.split(/(?<=\},)/);
}

interface Reply {
  text?: string;
  chunks?: string[];
  error?: OpenRouterError;
  /** Stream the chunks, then wait to be cancelled. */
  holdUntilAbort?: boolean;
}

function busy(): OpenRouterError {
  return new OpenRouterError({ kind: 'rateLimited', status: 429, message: 'temporarily rate-limited upstream' });
}

/** A scripted OpenRouter: no network, no key, one reply per request. */
function fakeClient(replies: Reply[]) {
  const calls: ChatRequest[] = [];
  let index = 0;

  const client: OpenRouterClient = {
    listFreeModels: async () => [],
    verifyKey: async () => ({ valid: true, label: null, freeTier: true }),
    async chat(request) {
      calls.push(request);
      const reply = replies[index] ?? { error: new OpenRouterError({ kind: 'server', message: 'the script ran out of replies' }) };
      index += 1;
      if (reply.error) throw reply.error;

      const chunks = reply.chunks ?? [reply.text ?? ''];
      let content = '';
      const cancelled = () => new OpenRouterError({ kind: 'aborted', message: 'cancelled', partial: content });

      for (const chunk of chunks) {
        if (request.signal?.aborted) throw cancelled();
        content += chunk;
        request.onDelta?.(chunk);
        await Promise.resolve();
      }

      if (reply.holdUntilAbort) {
        await new Promise<void>((resolve) => {
          request.signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        throw cancelled();
      }
      if (request.signal?.aborted) throw cancelled();

      return { content, model: request.model, finishReason: 'stop', usage: null };
    },
  };

  return { client, calls };
}

interface SetupOptions {
  fallbackEnabled?: boolean;
  client?: OpenRouterClient;
  /** Hold the request that would create document number N + 1, until released. */
  pauseCreateAt?: number;
  limits?: StreamLimits;
  /** A model the caller saved, which the chain may or may not list. */
  modelId?: string;
}

function setup(replies: Reply[], overrides: SetupOptions = {}) {
  const { client, calls } = fakeClient(replies);
  const documents: CreateDocumentInput[] = [];
  let count = 0;
  let release = () => undefined as void;

  const createDocument = async (input: CreateDocumentInput): Promise<WorkspaceDocument> => {
    if (documents.length === overrides.pauseCreateAt) {
      // A create in flight when the user cancels: it still lands.
      await new Promise<void>((resolve) => { release = resolve; });
    }
    documents.push(input);
    count += 1;
    if (input.name === 'boom.tsx') throw new Error('service said no');
    return {
      id: `doc-${count}`,
      ownerId: input.ownerId,
      parentId: input.parentId ?? null,
      name: input.name,
      kind: input.kind,
      content: input.content ?? '',
      createdAt: null,
      updatedAt: null,
    };
  };

  const view = renderHook(() => useProjectGenerator({
    client: overrides.client ?? client,
    chain: CHAIN,
    modelId: overrides.modelId,
    ownerId: 'user-1',
    createDocument,
    fallbackEnabled: overrides.fallbackEnabled,
    limits: overrides.limits,
  }));

  return { ...view, calls, documents, release: () => release() };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('readPlan', () => {
  test('reads a plan out of a fenced, chatty answer', () => {
    const plan = readPlan(`Sure!\n\`\`\`json\n${JSON.stringify(PLAN)}\n\`\`\`\nHope that helps.`);

    expect(plan?.files.map((file) => file.path)).toEqual(['index.html', 'package.json', 'src/main.tsx']);
  });

  test('is null for an answer with no files in it', () => {
    expect(readPlan('{"name":"x","files":[]}')).toBeNull();
    expect(readPlan('I cannot do that.')).toBeNull();
  });
});

describe('mergeFiles', () => {
  test('replaces by path and keeps the original order', () => {
    const merged = mergeFiles(FILES, [{ path: 'package.json', content: '{}' }, { path: 'src/App.tsx', content: 'x' }]);

    expect(merged.map((file) => file.path)).toEqual(['index.html', 'package.json', 'src/main.tsx', 'src/App.tsx']);
    expect(merged[1].content).toBe('{}');
  });
});

describe('describeAttempts', () => {
  test('names who was busy and who answered', () => {
    expect(describeAttempts([
      { id: 'a', label: 'Alpha', outcome: 'busy' },
      { id: 'b', label: 'Beta', outcome: 'answered' },
    ])).toBe('Alpha was busy — Beta answered.');
  });

  test('says nothing when the first model answered', () => {
    expect(describeAttempts([{ id: 'a', label: 'Alpha', outcome: 'answered' }])).toBeNull();
  });
});

describe('useProjectGenerator', () => {
  test('plans, then generates, validates and lands in ready', async () => {
    const { result, calls } = setup([
      { text: JSON.stringify(PLAN) },
      { chunks: chunksOf(projectJson(FILES)) },
    ]);

    act(() => { void result.current.plan('bare project with react'); });
    expect(result.current.state.phase).toBe('planning');
    await waitFor(() => expect(result.current.state.phase).toBe('plan'));
    expect(result.current.state.plan?.files).toHaveLength(3);

    act(() => { void result.current.generate(); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(result.current.state.files.map((file) => file.path)).toEqual([
      'index.html', 'package.json', 'src/main.tsx',
    ]);
    expect(result.current.state.report?.errors).toEqual([]);
    expect(result.current.state.notice).toBeNull();
    // Two requests only: a plan and a generation. No repair was needed.
    expect(calls).toHaveLength(2);
    expect(calls[1].model).toBe('alpha:free');
  });

  test('falls through to the next model when the first is rate-limited', async () => {
    const { result, calls } = setup([
      { error: busy() },
      { text: JSON.stringify(PLAN) },
    ]);

    act(() => { void result.current.plan('bare project'); });
    await waitFor(() => expect(result.current.state.phase).toBe('plan'));

    expect(calls.map((call) => call.model)).toEqual(['alpha:free', 'beta:free']);
    expect(result.current.state.model).toBe('beta:free');
    expect(result.current.state.attempts).toEqual([
      { id: 'alpha:free', label: 'Alpha', outcome: 'busy', detail: expect.stringContaining('rate-limited') },
      { id: 'beta:free', label: 'Beta', outcome: 'answered' },
    ]);
    expect(result.current.state.notice).toBe('Alpha was busy — Beta answered.');
  });

  test('a busy model with fallback switched off is simply an error', async () => {
    const { result, calls } = setup([{ error: busy() }], { fallbackEnabled: false });

    act(() => { void result.current.plan('bare project'); });
    await waitFor(() => expect(result.current.state.phase).toBe('error'));

    expect(calls).toHaveLength(1);
    expect(result.current.state.error).toMatch(/rate-limited/);
  });

  test('a model that answers with prose is passed over for the next one', async () => {
    const { result, calls } = setup([
      { text: 'I am afraid I cannot write that.' },
      { text: JSON.stringify(PLAN) },
    ]);

    act(() => { void result.current.plan('bare project'); });
    await waitFor(() => expect(result.current.state.phase).toBe('plan'));

    expect(calls).toHaveLength(2);
    expect(result.current.state.attempts[0].outcome).toBe('unusable');
  });

  test('cancelling mid-stream keeps the files that had arrived', async () => {
    const stream = chunksOf(projectJson(FILES));
    const { result } = setup([{ chunks: stream.slice(0, 2), holdUntilAbort: true }]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.files).toHaveLength(2));
    expect(result.current.state.phase).toBe('generating');

    act(() => { result.current.cancel(); });

    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.files.map((file) => file.path)).toEqual(['index.html', 'package.json']);
    expect(result.current.state.notice).toMatch(/Cancelled/);

    // The abandoned request must never write over the cancelled state.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.state.phase).toBe('ready');
  });

  test('cancelling before any file arrives goes back to the plan', async () => {
    const { result } = setup([{ chunks: ['{"files":['], holdUntilAbort: true }]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('generating'));

    act(() => { result.current.cancel(); });
    expect(result.current.state.phase).toBe('plan');
    expect(result.current.state.files).toEqual([]);
  });

  test('asks only for the missing files when the answer was cut off', async () => {
    const whole = projectJson(FILES);
    // Cut inside the last file, the way a token cap does.
    const cut = whole.slice(0, whole.lastIndexOf('src/main.tsx') + 30);

    const { result, calls } = setup([
      { chunks: chunksOf(cut) },
      { text: projectJson([{ path: 'src/main.tsx', content: MAIN }]) },
    ]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(calls).toHaveLength(2);
    const topUp = calls[1].messages.at(-1)?.content ?? '';
    expect(topUp).toContain('cut off');
    expect(topUp).toContain('src/main.tsx');
    expect(result.current.state.files.map((file) => file.path)).toEqual([
      'index.html', 'package.json', 'src/main.tsx',
    ]);
    expect(result.current.state.notice).toMatch(/cut off/);
    expect(result.current.state.report?.errors).toEqual([]);
  });

  test('stops a looping model and keeps everything it wrote first', async () => {
    const looping = `${projectJson([...FILES, { path: 'index.html', content: HTML }]).slice(0, -2)}`;
    const { result, calls } = setup([{ chunks: chunksOf(looping) }]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(result.current.state.files.map((file) => file.path)).toEqual([
      'index.html', 'package.json', 'src/main.tsx',
    ]);
    expect(result.current.state.notice).toMatch(/repeating itself/);
    // The stream was cut off rather than being asked for again.
    expect(calls).toHaveLength(1);
  });

  test('a model that loops before finishing a single file hands over to the next', async () => {
    const { result, calls } = setup([
      // One file opened and never closed, past the buffer guard.
      { chunks: [`{"files":[{"path":"src/a.ts","content":"${'x'.repeat(2_500)}`] },
      { chunks: chunksOf(projectJson(FILES)) },
      // The guard is set just above a whole good project, so only the run-on
      // answer trips it.
    ], { limits: { maxBuffer: 2_000 } });

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(calls.map((call) => call.model)).toEqual(['alpha:free', 'beta:free']);
    expect(result.current.state.attempts[0]).toMatchObject({ outcome: 'unusable' });
    expect(result.current.state.files).toHaveLength(3);
  });

  test('runs one repair round when validation finds errors', async () => {
    const broken = [FILES[0], { path: 'package.json', content: PACKAGE_WITH_TAILWIND }, FILES[2]];
    const { result, calls } = setup([
      { chunks: chunksOf(projectJson(broken)) },
      { text: projectJson([{ path: 'package.json', content: PACKAGE }]) },
    ]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain('Remove "tailwindcss"');
    expect(result.current.state.repaired).toBe(true);
    expect(result.current.state.report?.errors).toEqual([]);
    expect(result.current.state.files).toHaveLength(3);
    expect(result.current.state.notice).toMatch(/second pass/);
  });

  test('a repair that cannot run still leaves the user the files and the problems', async () => {
    const broken = [FILES[0], { path: 'package.json', content: PACKAGE_WITH_TAILWIND }, FILES[2]];
    const { result } = setup([
      { chunks: chunksOf(projectJson(broken)) },
      { error: new OpenRouterError({ kind: 'auth', status: 401, message: 'OpenRouter rejected this API key.' }) },
    ]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(result.current.state.files).toHaveLength(3);
    expect(result.current.state.report?.errors.length).toBeGreaterThan(0);
    expect(result.current.state.notice).toMatch(/could not run/);
    expect(result.current.state.error).toBeNull();
  });

  test('only one repair round is ever spent', async () => {
    const broken = [FILES[0], { path: 'package.json', content: PACKAGE_WITH_TAILWIND }, FILES[2]];
    const { result, calls } = setup([
      { chunks: chunksOf(projectJson(broken)) },
      // The repair changes nothing, so the same error is still there.
      { text: projectJson([{ path: 'package.json', content: PACKAGE_WITH_TAILWIND }]) },
    ]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(calls).toHaveLength(2);
    expect(result.current.state.report?.errors.length).toBeGreaterThan(0);
    expect(result.current.state.notice).toMatch(/remain/);
  });

  test('repair() spends another round on the problems that survived', async () => {
    const broken = [FILES[0], { path: 'package.json', content: PACKAGE_WITH_TAILWIND }, FILES[2]];
    const { result, calls } = setup([
      { chunks: chunksOf(projectJson(broken)) },
      // The automatic round fixes nothing, so the user asks for another.
      { text: projectJson([{ path: 'package.json', content: PACKAGE_WITH_TAILWIND }]) },
      { text: projectJson([{ path: 'package.json', content: PACKAGE }]) },
    ]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    expect(result.current.state.report?.errors.length).toBeGreaterThan(0);

    act(() => { void result.current.repair(); });
    expect(result.current.state.phase).toBe('repairing');
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(calls).toHaveLength(3);
    expect(result.current.state.report?.errors).toEqual([]);
    expect(result.current.state.files).toHaveLength(3);
    expect(result.current.state.notice).toMatch(/cleared every problem/);
  });

  test('a failed repair() changes nothing but the notice', async () => {
    const broken = [FILES[0], { path: 'package.json', content: PACKAGE_WITH_TAILWIND }, FILES[2]];
    const { result } = setup([
      { chunks: chunksOf(projectJson(broken)) },
      { text: projectJson([{ path: 'package.json', content: PACKAGE_WITH_TAILWIND }]) },
      { error: new OpenRouterError({ kind: 'auth', status: 401, message: 'OpenRouter rejected this API key.' }) },
    ]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    const before = result.current.state.files;

    act(() => { void result.current.repair(); });
    await waitFor(() => expect(result.current.state.notice).toMatch(/could not run/));

    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.files).toEqual(before);
    expect(result.current.state.error).toBeNull();
  });

  test('repair() does nothing when there is nothing wrong', async () => {
    const { result, calls } = setup([{ chunks: chunksOf(projectJson(FILES)) }]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    act(() => { void result.current.repair(); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    expect(calls).toHaveLength(1);
  });

  test('creates the documents and reports progress', async () => {
    const { result, documents } = setup([{ chunks: chunksOf(projectJson(FILES)) }]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    act(() => { void result.current.create(); });
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(documents.map((input) => input.name)).toEqual([
      'Bare App', 'src', 'index.html', 'package.json', 'main.tsx',
    ]);
    expect(result.current.state.result?.entryId).toBe('doc-3');
    expect(result.current.state.creation).toEqual({ done: 5, total: 5, path: 'src/main.tsx', kind: 'file' });
  });

  test('a half-created project says what already exists', async () => {
    const files = [...FILES, { path: 'src/boom.tsx', content: 'export const Boom = () => null;\n' }];
    const { result } = setup([{ chunks: chunksOf(projectJson(files)) }]);

    act(() => { void result.current.generate({ ...PLAN, files: files.map((file) => ({ path: file.path, purpose: '' })) }); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    act(() => { void result.current.create(); });
    await waitFor(() => expect(result.current.state.phase).toBe('error'));

    expect(result.current.state.error).toMatch(/service said no/);
    expect(result.current.state.created.map((item) => item.path)).toEqual([
      '', 'src', 'index.html', 'package.json', 'src/main.tsx',
    ]);
    expect(result.current.state.notice).toMatch(/5 documents had already been created/);
  });

  test('cancelling mid-create keeps and names the documents already made', async () => {
    const { result, documents, release } = setup(
      [{ chunks: chunksOf(projectJson(FILES)) }],
      { pauseCreateAt: 2 },
    );

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    act(() => { void result.current.create(); });
    await waitFor(() => expect(result.current.state.creation?.done).toBe(2));

    act(() => { result.current.cancel(); });
    // The third create was already in flight, so it finishes and is counted;
    // the fourth is never started.
    act(() => { release(); });

    await waitFor(() => expect(result.current.state.notice).toMatch(/Cancelled — 3 documents/));
    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.created.map((item) => item.path)).toEqual(['', 'src', 'index.html']);
    expect(documents).toHaveLength(3);
  });

  test('asks for the model the user chose, even when the chain has never heard of it', async () => {
    const { result, calls } = setup(
      [{ text: JSON.stringify(PLAN) }],
      { modelId: 'someone/brand-new-coder:free' },
    );

    act(() => { void result.current.plan('bare project'); });
    await waitFor(() => expect(result.current.state.phase).toBe('plan'));

    expect(calls.map((call) => call.model)).toEqual(['someone/brand-new-coder:free']);
    expect(result.current.state.model).toBe('someone/brand-new-coder:free');
    // Unknown to the chain means unknown to be strict-JSON, so no schema is
    // sent: asking a model that does not support one is a 400.
    expect(calls[0].schema).toBeUndefined();
  });

  test('a truncation top-up that fails leaves the files, validated, rather than the whole run', async () => {
    const whole = projectJson(FILES);
    const cut = whole.slice(0, whole.indexOf('"package.json"'));

    const { result } = setup(
      [{ chunks: chunksOf(cut) }, { error: busy() }, { error: busy() }],
      { fallbackEnabled: false },
    );

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(result.current.state.files.map((file) => file.path)).toEqual(['index.html']);
    expect(result.current.state.notice).toMatch(/could not be fetched/);
    // The point of the fix: validation still ran, so the review step can say
    // what is wrong instead of showing a bare failure.
    expect(result.current.state.report).not.toBeNull();
    expect(result.current.state.error).toBeNull();
  });

  test('a top-up with nothing to add does not walk the rest of the chain', async () => {
    const whole = projectJson(FILES);
    const cut = whole.slice(0, whole.indexOf('"package.json"'));
    const nothing = { text: '{"name":"Bare App","summary":"","files":[]}' };

    const { result, calls } = setup([{ chunks: chunksOf(cut) }, nothing, nothing]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    // "Nothing more to add" is an answer, not a reason to ask six more models.
    expect(calls.every((call) => call.model === 'alpha:free')).toBe(true);
    expect(result.current.state.files.map((file) => file.path)).toEqual(['index.html']);
  });

  test('a loop that stopped mid-JSON still asks for the files it never wrote', async () => {
    // The guard trips on the repeat, which by construction leaves the response
    // unfinished — so the missing files are still worth one request.
    const looping = projectJson([FILES[0], FILES[0]]).slice(0, -2);
    const { result, calls } = setup([
      { chunks: chunksOf(looping) },
      { text: projectJson([FILES[1], FILES[2]]) },
    ]);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain('package.json');
    expect(result.current.state.files.map((file) => file.path)).toEqual([
      'index.html', 'package.json', 'src/main.tsx',
    ]);
    expect(result.current.state.notice).toMatch(/repeating itself/);
    expect(result.current.state.report?.errors).toEqual([]);
  });

  test('keeps the name the user typed, not the one the model invented', async () => {
    const { result } = setup([{ chunks: chunksOf(projectJson(FILES, 'Counter Demo')) }]);

    act(() => { void result.current.generate({ ...PLAN, name: 'My App' }); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    expect(result.current.state.name).toBe('My App');

    act(() => { void result.current.create(); });
    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(result.current.state.result?.rootName).toBe('My App');
  });

  test('creating again after a half-created project finishes it instead of duplicating it', async () => {
    const files = [...FILES, { path: 'src/boom.tsx', content: 'export const Boom = () => null;\n' }];
    const { result, documents } = setup([{ chunks: chunksOf(projectJson(files)) }]);

    act(() => { void result.current.generate({ ...PLAN, files: files.map((file) => ({ path: file.path, purpose: '' })) }); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    act(() => { void result.current.create('My App'); });
    await waitFor(() => expect(result.current.state.phase).toBe('error'));
    const made = result.current.state.created.map((item) => item.path);

    act(() => { void result.current.create('My App'); });
    await waitFor(() => expect(result.current.state.phase).toBe('error'));

    // One project folder, and nothing already created was created twice.
    expect(documents.filter((input) => input.name === 'My App')).toHaveLength(1);
    expect(documents.filter((input) => input.name === 'index.html')).toHaveLength(1);
    expect(documents.filter((input) => input.name === 'src')).toHaveLength(1);
    expect(result.current.state.created.map((item) => item.path)).toEqual(made);
    expect(result.current.state.createdRootName).toBe('My App');
  });

  test('regenerating after a half-created project does not resume it with different files', async () => {
    const files = [...FILES, { path: 'src/boom.tsx', content: 'export const Boom = () => null;\n' }];
    const plan = { ...PLAN, files: files.map((file) => ({ path: file.path, purpose: '' })) };
    const { result } = setup([
      { chunks: chunksOf(projectJson(files)) },
      { chunks: chunksOf(projectJson(FILES)) },
    ]);

    act(() => { void result.current.generate(plan); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    act(() => { void result.current.create('My App'); });
    await waitFor(() => expect(result.current.state.phase).toBe('error'));
    expect(result.current.state.created.length).toBeGreaterThan(0);

    act(() => { void result.current.generate(PLAN); });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));

    // The half-made folder holds the old contents, so it is not the one this
    // set of files belongs in.
    expect(result.current.state.created).toEqual([]);
    expect(result.current.state.createdRootName).toBeNull();
  });

  test('reset puts everything back', async () => {
    const { result } = setup([{ text: JSON.stringify(PLAN) }]);

    act(() => { void result.current.plan('bare project'); });
    await waitFor(() => expect(result.current.state.phase).toBe('plan'));

    act(() => { result.current.reset(); });
    expect(result.current.state).toMatchObject({ phase: 'idle', plan: null, files: [], request: '' });
  });
});
