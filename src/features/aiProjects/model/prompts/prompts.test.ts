import { describe, expect, test } from 'vitest';
import {
  generateMessages,
  planMessages,
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  repairMessages,
  SYSTEM_PROMPT,
  TAILWIND_CDN,
  type ProjectPlan,
} from './prompts';

const PLAN: ProjectPlan = {
  name: 'Tiny Tailwind App',
  summary: 'A bare React 19 page.',
  files: [
    { path: 'index.html', purpose: 'Page shell with the Tailwind CDN script.' },
    { path: 'src/main.tsx', purpose: 'Mounts the app.' },
  ],
};

/** Strict mode rejects a schema that allows unlisted or optional properties. */
function assertStrict(schema: Record<string, unknown>, trail = 'root'): void {
  if (schema.type === 'object') {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(schema.additionalProperties, `${trail} allows extra keys`).toBe(false);
    expect(schema.required, `${trail} required`).toEqual(Object.keys(properties));
    for (const [key, value] of Object.entries(properties)) assertStrict(value, `${trail}.${key}`);
  }
  if (schema.type === 'array') assertStrict(schema.items as Record<string, unknown>, `${trail}[]`);
}

/** How deep the shape goes; these models lose the thread past two levels. */
function depth(schema: Record<string, unknown>): number {
  if (schema.type === 'array') return depth(schema.items as Record<string, unknown>);
  if (schema.type !== 'object') return 0;
  const properties = Object.values(schema.properties as Record<string, Record<string, unknown>>);
  return 1 + Math.max(0, ...properties.map(depth));
}

describe('SYSTEM_PROMPT', () => {
  test('states the rules the preview actually enforces', () => {
    expect(SYSTEM_PROMPT).toContain(TAILWIND_CDN);
    expect(SYSTEM_PROMPT).toContain('MemoryRouter');
    expect(SYSTEM_PROMPT).toContain('<div id="root"></div>');
    expect(SYSTEM_PROMPT).toContain('/src/main.tsx');
    expect(SYSTEM_PROMPT).toContain('import.meta.env.MODE');
  });

  test('bans what the sandbox cannot run', () => {
    for (const banned of ['@tailwind', 'postcss.config.js', 'tailwind.config.js', '.png', 'node_modules', 'process.env']) {
      expect(SYSTEM_PROMPT).toContain(banned);
    }
  });

  test('pins the package.json rule that generations get wrong', () => {
    expect(SYSTEM_PROMPT).toContain('every package that is imported');
    expect(SYSTEM_PROMPT).toContain('and nothing else');
  });

  test('tells the model not to repeat a file, which is how it loops', () => {
    expect(SYSTEM_PROMPT).toContain('Write each path exactly once');
  });
});

describe('schemas', () => {
  test.each([['plan', PLAN_SCHEMA], ['project', PROJECT_SCHEMA]] as const)('%s is strict-ready', (_name, spec) => {
    assertStrict(spec.schema);
    expect(spec.name).toMatch(/^[a-z_]+$/);
  });

  test.each([['plan', PLAN_SCHEMA], ['project', PROJECT_SCHEMA]] as const)('%s stays flat', (_name, spec) => {
    expect(depth(spec.schema)).toBe(2);
  });

  test('the two differ only in what each file carries', () => {
    const planFile = (PLAN_SCHEMA.schema.properties as Record<string, Record<string, unknown>>).files;
    const projectFile = (PROJECT_SCHEMA.schema.properties as Record<string, Record<string, unknown>>).files;

    expect(Object.keys((planFile.items as { properties: object }).properties)).toEqual(['path', 'purpose']);
    expect(Object.keys((projectFile.items as { properties: object }).properties)).toEqual(['path', 'content']);
  });
});

describe('planMessages', () => {
  test('asks for the file list and no code', () => {
    const [system, user] = planMessages('  bare project with react and tailwind  ');

    expect(system.role).toBe('system');
    expect(system.content).toBe(SYSTEM_PROMPT);
    expect(user.role).toBe('user');
    expect(user.content).toContain('bare project with react and tailwind');
    expect(user.content).toContain('Do not write any code yet');
    expect(user.content).toContain('"purpose"');
  });
});

describe('generateMessages', () => {
  test('carries the approved plan, so the user gets what they agreed to', () => {
    const [, user] = generateMessages('a counter', PLAN);

    expect(user.content).toContain('a counter');
    expect(user.content).toContain('- index.html — Page shell with the Tailwind CDN script.');
    expect(user.content).toContain('- src/main.tsx — Mounts the app.');
    expect(user.content).toContain('and no others');
    expect(user.content).toContain('"content"');
  });
});

describe('repairMessages', () => {
  const files = [{ path: 'package.json', content: '{"dependencies":{"tailwindcss":"^4"}}' }];

  test('names the problems and shows what exists', () => {
    const [, user] = repairMessages('a counter', files, [
      '"tailwindcss" is in dependencies but Tailwind has no build step here',
    ]);

    expect(user.content).toContain('- "tailwindcss" is in dependencies');
    expect(user.content).toContain('--- package.json');
    expect(user.content).toContain('{"dependencies":{"tailwindcss":"^4"}}');
  });

  test('asks only for what changed, because free models are billed in tokens', () => {
    const [, user] = repairMessages('a counter', files, ['missing src/main.tsx']);

    expect(user.content).toContain('Return only the files that must change');
    expect(user.content).toContain('Do not repeat a file that is already correct');
  });

  test('handles a response that was cut off before any file arrived', () => {
    const [, user] = repairMessages('a counter', [], ['the response was cut short']);

    expect(user.content).toContain('(nothing was written yet)');
  });
});
