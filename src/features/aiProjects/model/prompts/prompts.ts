import type { ChatMessage, JsonSchemaSpec } from '../openrouter/openrouter';
import type { ProjectFile } from '../streamJson/streamJson';

/**
 * What the model is told, and the shapes it must answer in.
 *
 * Everything here is a rule about *this* runtime, not general React advice: a
 * generated project runs in the preview sandbox, which has no install step, no
 * Node and no build — so a perfectly ordinary `npm install tailwindcss` answer
 * is a broken project here. The rules are written the way the sandbox enforces
 * them, so validation and the prompt cannot drift apart.
 */

export interface PlannedFile {
  path: string;
  /** One line: what this file is for. Keeps the plan cheap to read. */
  purpose: string;
}

export interface ProjectPlan {
  name: string;
  summary: string;
  files: PlannedFile[];
}

export interface GeneratedProject {
  name: string;
  summary: string;
  files: ProjectFile[];
}

/** Where Tailwind has to come from: there is no PostCSS step in the sandbox. */
export const TAILWIND_CDN = 'https://cdn.tailwindcss.com';

/**
 * The house rules. Numbered and flat on purpose — a 27B free model follows a
 * list far more reliably than prose, and quotes the exact strings back.
 */
export const RUNTIME_RULES = `HOW PROJECTS RUN HERE
1. Vite shape. A project is an "index.html" at the root with <div id="root"></div> and <script type="module" src="/src/main.tsx"></script>. All source lives under "src/".
2. No install step. npm packages are loaded from a CDN at run time by their bare name ("react", "zustand"). There is no node_modules and no lockfile.
3. package.json lists every package that is imported anywhere in the code, under "dependencies", and nothing else. Never list a build-only tool (vite, typescript, tailwindcss, postcss, autoprefixer, eslint) — there is no build. Never list a package the code does not import.
4. No Node. No "fs", "path", "process", "process.env", "__dirname", no server, no API routes, no scripts that must be run. "import.meta.env.MODE" is the only environment value available.
5. Tailwind has no build step here. To use Tailwind, put <script src="${TAILWIND_CDN}"></script> in index.html and use utility classes. Never write "@tailwind" directives, "tailwind.config.js", "postcss.config.js" or a tailwindcss dependency — they do nothing and count as errors.
6. Routing must use MemoryRouter from react-router. The sandbox has no URL bar, so BrowserRouter and HashRouter show a blank page.
7. Importable files only: .ts .tsx .js .jsx .css (including *.module.css) .json .svg. There are no binary assets — no .png, .jpg, .gif, .ico, no fetch of a local image. Draw with inline SVG, CSS or emoji instead.
8. TypeScript is type-checked in the editor and type-stripped to run. Code must be strict-clean: every prop and parameter typed, no "any", no unused imports, no non-null "!" guesses.
9. Data comes from inside the project. No backend, no secret keys, no fetch to a service that needs one. Seed arrays in a .ts file are the way to show data.

HOW TO ANSWER
10. Return JSON only. No prose outside it, no markdown fences, no comments between files.
11. Every file must be complete and final. Never write "...", "TODO", "rest of the code here" or an empty placeholder body.
12. Paths are relative to the project root, forward slashes, no leading "/", no "node_modules", no ".git".
13. Write each path exactly once. Never repeat a file you have already written. Stop as soon as the last file is written.
14. Keep it small: the fewest files that make the request work, ideally under twelve, each under ~200 lines.`;

export const SYSTEM_PROMPT = `You generate small, runnable web projects for a browser-based code editor that runs them in a sandboxed preview.

${RUNTIME_RULES}`;

/** `additionalProperties: false` plus a full `required` — what strict mode needs. */
function objectSchema(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/**
 * Two flat schemas, each one object deep.
 *
 * Nesting is where these models go wrong — asked for files grouped by folder,
 * they invent a third level and the strict parse fails — so the file list is a
 * flat array of two-string objects and the path carries the structure.
 */
export const PLAN_SCHEMA: JsonSchemaSpec = {
  name: 'project_plan',
  schema: objectSchema({
    name: { type: 'string', description: 'Short project name, 1-4 words.' },
    summary: { type: 'string', description: 'One sentence describing what the project does.' },
    files: {
      type: 'array',
      description: 'Every file the project needs, in the order they will be written.',
      items: objectSchema({
        path: { type: 'string', description: 'Project-relative path, e.g. src/main.tsx' },
        purpose: { type: 'string', description: 'One line: what this file contains.' },
      }),
    },
  }),
};

export const PROJECT_SCHEMA: JsonSchemaSpec = {
  name: 'project_files',
  schema: objectSchema({
    name: { type: 'string', description: 'Short project name, 1-4 words.' },
    summary: { type: 'string', description: 'One sentence describing what the project does.' },
    files: {
      type: 'array',
      description: 'The complete files. Each path appears exactly once.',
      items: objectSchema({
        path: { type: 'string', description: 'Project-relative path, e.g. src/main.tsx' },
        content: { type: 'string', description: 'The entire file, ready to run.' },
      }),
    },
  }),
};

/**
 * The shape repeated in the user turn as well as the schema.
 *
 * Models without `structured_outputs` (the prompt-JSON fallbacks) only have
 * this to go on, and the ones with it follow the prompt more closely when the
 * two agree.
 */
function jsonOnly(shape: string): string {
  return `Answer with JSON only, exactly this shape:\n${shape}`;
}

const PLAN_SHAPE = '{"name":"...","summary":"...","files":[{"path":"...","purpose":"..."}]}';
const PROJECT_SHAPE = '{"name":"...","summary":"...","files":[{"path":"...","content":"..."}]}';

/** Plan first: a file list is cheap, and it is what the user approves. */
export function planMessages(request: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Plan the files for this project. Do not write any code yet.

REQUEST
${request.trim()}

${jsonOnly(PLAN_SHAPE)}`,
    },
  ];
}

/**
 * Writing follows the approved plan rather than the request alone, so the user
 * knows what they are getting before a minute of generation is spent, and an
 * edited plan is obeyed.
 */
export function generateMessages(request: string, plan: ProjectPlan): ChatMessage[] {
  const outline = plan.files.map((file) => `- ${file.path} — ${file.purpose}`).join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Write this project in full.

REQUEST
${request.trim()}

PLAN (write exactly these files, in this order, and no others)
${outline}

${jsonOnly(PROJECT_SHAPE)}`,
    },
  ];
}

/**
 * The second pass, for both ways a generation comes back wrong: validation
 * found something the sandbox cannot run (a `tailwindcss` dependency, a `png`
 * import, `BrowserRouter`), or the response was cut off and files are missing.
 *
 * It asks for the changed files only. A full rewrite would re-send every file
 * the model already got right, and free models are rate-limited by the token,
 * so the cheap round trip is the one that can actually be retried.
 */
export function repairMessages(
  request: string,
  files: ProjectFile[],
  problems: string[],
): ChatMessage[] {
  const existing = files.length > 0
    ? files.map((file) => `--- ${file.path}\n${file.content}`).join('\n\n')
    : '(nothing was written yet)';

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `This project does not run yet. Fix it.

REQUEST
${request.trim()}

PROBLEMS
${problems.map((problem) => `- ${problem}`).join('\n')}

FILES WRITTEN SO FAR
${existing}

Return only the files that must change, plus any file that is still missing —
each one complete. Do not repeat a file that is already correct, and never
change a path that is already right.

${jsonOnly(PROJECT_SHAPE)}`,
    },
  ];
}
