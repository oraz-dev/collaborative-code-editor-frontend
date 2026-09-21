import {
  MAX_PROJECT_FILES,
  isAbortError,
  isAccessBoundary,
  loadProject,
  type ProjectDocument,
  type ProjectFetchers,
} from './loadProject';

type Node = ProjectDocument;

function folder(id: string, name: string, parentId: string | null): Node {
  return { id, name, parentId, kind: 'folder', content: '' };
}

function file(id: string, name: string, parentId: string | null, content = `// ${name}`): Node {
  return { id, name, parentId, kind: 'file', content };
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

interface FakeOptions {
  /** Ids whose fetchDocument / fetchChildren answer with this status. */
  denied?: Record<string, number>;
  /** Ids whose children listing fails with a non-access error. */
  broken?: string[];
}

/**
 * An in-memory document service. Records every call in order, and holds each
 * children request open until the test's microtask queue drains, so requests
 * issued "together" are observably in flight together.
 */
function fakeService(nodes: Node[], options: FakeOptions = {}) {
  const { denied = {}, broken = [] } = options;
  const calls: string[] = [];
  const inFlight = { now: 0, peak: 0 };

  const fetchers: ProjectFetchers = {
    fetchDocument: vi.fn(async (id: string) => {
      calls.push(`doc:${id}`);
      if (denied[id]) throw new HttpError(denied[id]);
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) throw new HttpError(404);
      return node;
    }),
    fetchChildren: vi.fn(async (id: string) => {
      calls.push(`children:${id}`);
      inFlight.now += 1;
      inFlight.peak = Math.max(inFlight.peak, inFlight.now);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight.now -= 1;
      if (denied[id]) throw new HttpError(denied[id]);
      if (broken.includes(id)) throw new HttpError(500);
      return nodes.filter((node) => node.parentId === id);
    }),
    fetchRoots: vi.fn(async () => {
      calls.push('roots');
      return nodes.filter((node) => node.parentId === null);
    }),
  };

  return { fetchers, calls, inFlight };
}

/*
 * project/
 *   package.json
 *   src/
 *     App.tsx          <- open
 *     components/
 *       Button.tsx
 *       index.ts
 *     lib/
 *       math.ts
 *   public/
 *     index.html
 * elsewhere/
 *   other.ts
 */
const PROJECT: Node[] = [
  folder('p', 'project', null),
  file('pkg', 'package.json', 'p', '{}'),
  folder('src', 'src', 'p'),
  file('app', 'App.tsx', 'src', 'saved App'),
  folder('components', 'components', 'src'),
  file('button', 'Button.tsx', 'components'),
  file('cindex', 'index.ts', 'components'),
  folder('lib', 'lib', 'src'),
  file('math', 'math.ts', 'lib'),
  folder('public', 'public', 'p'),
  file('html', 'index.html', 'public'),
  folder('elsewhere', 'elsewhere', null),
  file('other', 'other.ts', 'elsewhere'),
];

const APP = PROJECT.find((node) => node.id === 'app') as Node;

function paths(files: { path: string }[]): string[] {
  return files.map((entry) => entry.path).sort();
}

describe('loadProject', () => {
  test('loads the whole project under the highest folder, with paths below the root', async () => {
    const { fetchers } = fakeService(PROJECT);

    const project = await loadProject({ document: APP, liveContent: 'live App', fetchers });

    expect(project.rootName).toBe('project');
    expect(project.entry).toBe('src/App.tsx');
    expect(paths(project.files)).toEqual([
      'package.json',
      'public/index.html',
      'src/App.tsx',
      'src/components/Button.tsx',
      'src/components/index.ts',
      'src/lib/math.ts',
    ]);
    expect(project.truncated).toBe(false);
    expect(project.fileCount).toBe(6);
    expect(project.warnings).toEqual([]);
  });

  test('the open file carries the live buffer, not what the server saved', async () => {
    const { fetchers } = fakeService(PROJECT);

    const project = await loadProject({ document: APP, liveContent: 'live App', fetchers });
    const app = project.files.filter((entry) => entry.path === 'src/App.tsx');

    expect(app).toEqual([{ path: 'src/App.tsx', content: 'live App' }]);
  });

  test('never reaches into an unrelated top-level folder', async () => {
    const { fetchers, calls } = fakeService(PROJECT);

    const project = await loadProject({ document: APP, liveContent: '', fetchers });

    expect(paths(project.files)).not.toContain('other.ts');
    expect(calls).not.toContain('children:elsewhere');
    expect(calls).not.toContain('roots');
  });

  test('requests every folder at one depth before any folder at the next', async () => {
    const { fetchers, calls, inFlight } = fakeService(PROJECT);

    await loadProject({ document: APP, liveContent: '', fetchers });

    const listings = calls.filter((call) => call.startsWith('children:'));
    expect(listings).toEqual([
      // Finding the root, nearest ancestor first: src has no marker, p has package.json.
      'children:src',
      'children:p',
      // depth 1 — src was already listed on the way up, and is not asked again
      'children:public',
      // depth 2
      'children:components',
      'children:lib',
    ]);
    // Issued together, not one after another.
    expect(inFlight.peak).toBe(2);
  });

  test('a 403 mid-walk-up makes the last folder that answered the root', async () => {
    // Shared out of someone else's tree: `src` is visible, `project` is not.
    const { fetchers, calls } = fakeService(PROJECT, { denied: { p: 403 } });

    const project = await loadProject({ document: APP, liveContent: 'live', fetchers });

    expect(project.rootName).toBe('src');
    expect(project.entry).toBe('App.tsx');
    expect(paths(project.files)).toEqual([
      'App.tsx',
      'components/Button.tsx',
      'components/index.ts',
      'lib/math.ts',
    ]);
    expect(calls).not.toContain('children:p');
    expect(project.warnings).toEqual([]);
  });

  test('a 404 on the parent itself still lists the parent, unnamed', async () => {
    // Only the lookup refuses; the listing of the same folder still answers.
    const { fetchers } = fakeService(PROJECT);
    fetchers.fetchDocument = vi.fn(async () => {
      throw new HttpError(404);
    });

    const project = await loadProject({ document: APP, liveContent: 'live', fetchers });

    expect(project.rootName).toBe('');
    expect(project.entry).toBe('App.tsx');
    expect(paths(project.files)).toContain('lib/math.ts');
  });

  test('falls back to the open file alone when its folder cannot be listed, and says so', async () => {
    const { fetchers } = fakeService(PROJECT, { denied: { src: 403 } });

    const project = await loadProject({ document: APP, liveContent: 'live', fetchers });

    expect(project.files).toEqual([{ path: 'App.tsx', content: 'live' }]);
    expect(project.warnings).toHaveLength(1);
    expect(project.warnings[0]).toMatch(/only this file/i);
  });

  test('skips a subfolder it may not open, with a warning naming it', async () => {
    const { fetchers } = fakeService(PROJECT, { denied: { lib: 403 } });

    const project = await loadProject({ document: APP, liveContent: '', fetchers });

    expect(paths(project.files)).not.toContain('src/lib/math.ts');
    expect(paths(project.files)).toContain('src/components/Button.tsx');
    expect(project.warnings).toEqual([expect.stringContaining('src/lib/')]);
  });

  test('a server fault is an error, not an access boundary', async () => {
    const { fetchers } = fakeService(PROJECT, { broken: ['components'] });

    await expect(loadProject({ document: APP, liveContent: '', fetchers }))
      .rejects.toMatchObject({ status: 500 });
  });

  test('a network failure on the walk up is an error too', async () => {
    const { fetchers } = fakeService(PROJECT);
    fetchers.fetchDocument = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(loadProject({ document: APP, liveContent: '', fetchers }))
      .rejects.toThrow('Failed to fetch');
  });

  test('an ancestor answer that is not a folder ends the walk there', async () => {
    // A malformed response mapped to a file must not become a path segment.
    const { fetchers } = fakeService(PROJECT);
    fetchers.fetchDocument = vi.fn(async (id: string) => file(id, 'weird', null));

    const project = await loadProject({ document: APP, liveContent: '', fetchers });

    expect(project.entry).toBe('App.tsx');
    expect(project.rootName).toBe('');
  });

  test('survives a parent cycle in the data', async () => {
    const cyclic: Node[] = [
      folder('a', 'a', 'b'),
      folder('b', 'b', 'a'),
      file('f', 'main.js', 'a'),
    ];
    const { fetchers } = fakeService(cyclic);

    const project = await loadProject({ document: cyclic[2], liveContent: '', fetchers });

    expect(paths(project.files)).toContain(project.entry);
  });

  describe('the project root', () => {
    /*
     * Work/
     *   notes.md
     *   app-a/  index.html (Vite), public/vite.svg, src/{main.tsx, App.tsx <- open}
     *   app-b/  package.json, src/main.tsx
     */
    const WORK: Node[] = [
      folder('w', 'Work', null),
      file('notes', 'notes.md', 'w'),
      folder('a', 'app-a', 'w'),
      file('a-html', 'index.html', 'a', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>'),
      folder('a-public', 'public', 'a'),
      file('a-svg', 'vite.svg', 'a-public', '<svg/>'),
      folder('a-src', 'src', 'a'),
      file('a-main', 'main.tsx', 'a-src'),
      file('a-app', 'App.tsx', 'a-src'),
      folder('b', 'app-b', 'w'),
      file('b-pkg', 'package.json', 'b', '{}'),
      folder('b-src', 'src', 'b'),
      file('b-main', 'main.tsx', 'b-src'),
    ];
    const OPEN = WORK.find((node) => node.id === 'a-app') as Node;

    test('is the nearest folder that looks like a project, not the highest reachable', async () => {
      const { fetchers, calls } = fakeService(WORK);

      const project = await loadProject({ document: OPEN, liveContent: 'live', fetchers });

      expect(project.rootName).toBe('app-a');
      expect(project.entry).toBe('src/App.tsx');
      // Rooted where Vite roots it: index.html, /src/main.tsx and public/ line up.
      expect(paths(project.files)).toEqual(['index.html', 'public/vite.svg', 'src/App.tsx', 'src/main.tsx']);
      // A sibling project is neither walked nor counted against the cap.
      expect(calls).not.toContain('children:b');
      expect(calls).not.toContain('children:w');
    });

    test('a package.json marks a root as well', async () => {
      const { fetchers } = fakeService(WORK);
      const project = await loadProject({
        document: WORK.find((node) => node.id === 'b-main') as Node, liveContent: '', fetchers,
      });

      expect(project.rootName).toBe('app-b');
      expect(project.entry).toBe('src/main.tsx');
    });

    test('a plain index.html marks a site root when nothing stronger does', async () => {
      const site: Node[] = [
        folder('top', 'Top', null),
        folder('s', 'site', 'top'),
        file('s-html', 'index.html', 's', '<script src="js/app.js"></script>'),
        folder('s-js', 'js', 's'),
        file('s-app', 'app.js', 's-js'),
      ];
      const { fetchers } = fakeService(site);

      const project = await loadProject({ document: site[4], liveContent: '', fetchers });

      expect(project.rootName).toBe('site');
      expect(paths(project.files)).toEqual(['index.html', 'js/app.js']);
    });

    test('falls back to the highest reachable folder when nothing looks like a project', async () => {
      const bare: Node[] = [
        folder('x', 'x', null),
        folder('y', 'y', 'x'),
        file('f', 'main.js', 'y'),
      ];
      const { fetchers } = fakeService(bare);

      const project = await loadProject({ document: bare[2], liveContent: '', fetchers });

      expect(project.rootName).toBe('x');
      expect(project.entry).toBe('y/main.js');
    });
  });

  describe('a root-level file', () => {
    const LOOSE: Node[] = [
      file('a', 'a.js', null),
      file('b', 'b.js', null, 'export const b = 1;'),
      folder('proj', 'proj', null),
      file('inner', 'inner.js', 'proj'),
    ];

    test('gets the other root-level files, and no folder contents', async () => {
      const { fetchers, calls } = fakeService(LOOSE);

      const project = await loadProject({ document: LOOSE[0], liveContent: 'live a', fetchers });

      expect(project.entry).toBe('a.js');
      expect(project.rootName).toBe('');
      expect(project.files).toEqual([
        { path: 'a.js', content: 'live a' },
        { path: 'b.js', content: 'export const b = 1;' },
      ]);
      expect(calls.some((call) => call.startsWith('children:'))).toBe(false);
    });
  });

  describe('the file cap', () => {
    const MANY: Node[] = [
      folder('root', 'root', null),
      file('entry', 'zz-entry.js', 'root'),
      ...Array.from({ length: 5 }, (_, index) => file(`f${index}`, `f${index}.js`, 'root')),
      folder('deep', 'deep', 'root'),
      file('d', 'd.js', 'deep'),
    ];
    const ENTRY = MANY[1];

    test('stops at the cap and flags the project as truncated, with a warning', async () => {
      const { fetchers } = fakeService(MANY);

      const project = await loadProject({
        document: ENTRY, liveContent: 'live', fetchers, maxFiles: 3,
      });

      expect(project.fileCount).toBe(3);
      expect(project.files).toHaveLength(3);
      expect(project.truncated).toBe(true);
      expect(project.warnings).toEqual([expect.stringMatching(/more than 3 files/)]);
    });

    test('always keeps the open file, even when it sorts last', async () => {
      const { fetchers } = fakeService(MANY);

      const project = await loadProject({
        document: ENTRY, liveContent: 'live', fetchers, maxFiles: 2,
      });

      expect(project.files).toContainEqual({ path: 'zz-entry.js', content: 'live' });
    });

    test('does not descend once full', async () => {
      const { fetchers, calls } = fakeService(MANY);

      await loadProject({ document: ENTRY, liveContent: '', fetchers, maxFiles: 3 });

      expect(calls).not.toContain('children:deep');
    });

    test('is not flagged when everything fits', async () => {
      const { fetchers } = fakeService(MANY);

      const project = await loadProject({ document: ENTRY, liveContent: '', fetchers });

      expect(project.truncated).toBe(false);
      expect(project.fileCount).toBe(7);
    });

    test('applies to root-level files as well', async () => {
      const loose = Array.from({ length: 4 }, (_, index) => file(`r${index}`, `r${index}.js`, null));
      const { fetchers } = fakeService(loose);

      const project = await loadProject({
        document: loose[0], liveContent: '', fetchers, maxFiles: 2,
      });

      expect(project.files).toHaveLength(2);
      expect(project.truncated).toBe(true);
    });

    test('defaults to 300', () => {
      expect(MAX_PROJECT_FILES).toBe(300);
    });
  });

  describe('cancellation', () => {
    test('an aborted load rejects with an abort error', async () => {
      const { fetchers } = fakeService(PROJECT);
      const controller = new AbortController();

      const pending = loadProject({
        document: APP, liveContent: '', fetchers, signal: controller.signal,
      });
      controller.abort();

      const error = await pending.catch((reason: unknown) => reason);
      expect(isAbortError(error)).toBe(true);
    });

    test('stops walking once aborted', async () => {
      const { fetchers, calls } = fakeService(PROJECT);
      const controller = new AbortController();
      fetchers.fetchChildren = vi.fn(async (id: string) => {
        calls.push(`children:${id}`);
        controller.abort();
        return PROJECT.filter((node) => node.parentId === id);
      });

      await expect(loadProject({
        document: APP, liveContent: '', fetchers, signal: controller.signal,
      })).rejects.toSatisfy(isAbortError);

      expect(calls.filter((call) => call.startsWith('children:'))).toEqual(['children:src']);
    });

    test('hands the signal to every request, so they can be cancelled in flight', async () => {
      const { fetchers } = fakeService(PROJECT);
      const controller = new AbortController();

      await loadProject({ document: APP, liveContent: '', fetchers, signal: controller.signal });

      expect(fetchers.fetchDocument).toHaveBeenCalledWith('src', controller.signal);
      expect(fetchers.fetchChildren).toHaveBeenCalledWith('p', controller.signal);
    });
  });
});

describe('isAccessBoundary', () => {
  test.each([403, 404])('%i is the edge of what you can see', (status) => {
    expect(isAccessBoundary({ status })).toBe(true);
  });

  test.each([401, 500, undefined])('%s is not', (status) => {
    expect(isAccessBoundary({ status })).toBe(false);
  });

  test('tolerates a non-object', () => {
    expect(isAccessBoundary(null)).toBe(false);
  });
});

describe('isAbortError', () => {
  test('recognises a DOM abort and the HTTP client\'s own', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbortError({ kind: 'aborted' })).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
  });
});
