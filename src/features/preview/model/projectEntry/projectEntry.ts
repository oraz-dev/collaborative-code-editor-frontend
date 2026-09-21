import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';
import { hasModuleScript } from '../htmlPage/htmlPage';

/**
 * Where a project starts, in the order Vite and the common templates put it.
 *
 * `main.*` and `index.*` (Create React App's name for it) before `App.*`,
 * because they are what mounts `App`: running `App` alone skips whatever they
 * set up around it (providers, global CSS).
 */
export const ENTRY_CANDIDATES = [
  'src/main.tsx',
  'src/main.jsx',
  'src/main.ts',
  'src/main.js',
  'main.tsx',
  'main.jsx',
  'main.ts',
  'main.js',
  'src/index.tsx',
  'src/index.jsx',
  'src/index.ts',
  'src/index.js',
  'index.tsx',
  'index.jsx',
  'index.ts',
  'index.js',
  'src/App.tsx',
  'src/App.jsx',
  'App.tsx',
  'App.jsx',
] as const;

const PAGE_ENTRY = 'index.html';

/**
 * The file a Run of the whole project starts from, or null when the project
 * has no recognisable entry.
 *
 * A root `index.html` wins first when it loads one of the project's own
 * modules by `src` — the Vite shape, where the page *is* the app's entry. A
 * page whose only module comes from a CDN is not that: a static demo beside a
 * real `src/main.tsx` must not stand in for the app.
 *
 * Any other root `index.html` is the entry only when no script candidate
 * exists, so a plain HTML + classic-script project runs as a whole, while a
 * leftover static page beside a `src/main.tsx` does not.
 */
export function detectProjectEntry(files: PreviewFile[]): string | null {
  const byPath = new Map(files.map((file) => [file.path, file]));

  const page = byPath.get(PAGE_ENTRY);
  if (page && hasModuleScript(page.content, PAGE_ENTRY, files)) return PAGE_ENTRY;

  const script = ENTRY_CANDIDATES.find((path) => byPath.has(path));
  if (script) return script;

  return page ? PAGE_ENTRY : null;
}

/** Whether a Run starts from the project's entry or from the open file. */
export type RunScope = 'project' | 'file';

export interface RunEntryChoice {
  /** The path to build the preview from. */
  entry: string;
  /** Whether that is the project's entry rather than the open file. */
  runsProject: boolean;
  /**
   * Whether the choice means anything here: there is a project entry, and it
   * is not the open file itself.
   */
  canChoose: boolean;
}

/**
 * Decides what a Run actually runs.
 *
 * An open `.html` file is always itself: a page is already a whole app, and
 * running `index.html` while looking at `about.html` would show the wrong
 * page. Otherwise the project entry is run unless the user asked for the open
 * file alone.
 */
export function chooseRunEntry(options: {
  openFile: string;
  projectEntry: string | null;
  scope: RunScope;
}): RunEntryChoice {
  const { openFile, projectEntry, scope } = options;

  const canChoose = projectEntry !== null
    && projectEntry !== openFile
    && !/\.html?$/i.test(openFile);

  if (!canChoose || scope === 'file') {
    return { entry: openFile, runsProject: false, canChoose };
  }
  return { entry: projectEntry, runsProject: true, canChoose };
}
