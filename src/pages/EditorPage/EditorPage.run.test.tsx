import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { EditorPage } from './EditorPage';

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="monaco-stub" /> }));

const DOC = {
  id: 'doc-1', owner_id: 'u1', parent_id: 'f1',
  docname: 'ttt.ts', doctype: 'file', content: 'const a: number = 1',
};

function mockApi() {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }), { status: 200 });
    if (url.includes('/documents/doc-1/yjs-state')) return new Response(JSON.stringify({ state: null }), { status: 200 });
    if (url.includes('/documents/doc-1/ws-ticket')) return new Response(JSON.stringify({ ticket: 't', role: 'owner', can_edit: true }), { status: 200 });
    if (url.match(/\/documents\/doc-1$/)) return new Response(JSON.stringify(DOC), { status: 200 });
    if (url.includes('/children') || url.includes('/roots') || url.includes('shared-with-me')) return new Response('[]', { status: 200 });
    return new Response('[]', { status: 200 });
  }));
}

describe('Run button', () => {
  test('appears for a TypeScript file', async () => {
    mockApi();
    renderWithProviders(
      <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
      { route: '/editor/doc-1' },
    );
    await waitFor(() => {
      expect(screen.getByTestId('run-button')).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  test('stays hidden for a file the preview cannot run', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
      if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }), { status: 200 });
      if (url.match(/\/documents\/doc-1$/)) {
        return new Response(JSON.stringify({ ...DOC, docname: 'styles.css' }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }));

    renderWithProviders(
      <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
      { route: '/editor/doc-1' },
    );

    await waitFor(() => expect(screen.getByLabelText('Settings')).toBeInTheDocument());
    expect(screen.queryByTestId('run-button')).not.toBeInTheDocument();
  });
});

describe('previewing a file inside a project', () => {
  /*
   * proj/            (p)
   *   src/           (f1)
   *     App.tsx      (doc-1, open)
   *   lib/           (lib)
   *     util.ts
   *     theme.css    <- another folder's stylesheet
   */
  const APP = {
    id: 'doc-1', owner_id: 'u1', parent_id: 'f1',
    docname: 'App.tsx', doctype: 'file',
    content: "import { greet } from '../lib/util';\nexport default function App() { return greet(); }",
  };
  const FOLDERS: Record<string, unknown> = {
    f1: { id: 'f1', owner_id: 'u1', parent_id: 'p', docname: 'src', doctype: 'folder' },
    p: { id: 'p', owner_id: 'u1', docname: 'proj', doctype: 'folder' },
  };
  const CHILDREN: Record<string, unknown[]> = {
    p: [FOLDERS.f1, { id: 'lib', owner_id: 'u1', parent_id: 'p', docname: 'lib', doctype: 'folder' }],
    f1: [APP],
    lib: [
      { id: 'u', owner_id: 'u1', parent_id: 'lib', docname: 'util.ts', doctype: 'file', content: 'export const greet = () => "hi";' },
      { id: 'c', owner_id: 'u1', parent_id: 'lib', docname: 'theme.css', doctype: 'file', content: '.from-lib { color: red; }' },
    ],
  };

  /* The same project made a Vite app: an index.html and main.tsx beside App. */
  const VITE_CHILDREN: Record<string, unknown[]> = {
    p: [
      ...CHILDREN.p,
      {
        id: 'html', owner_id: 'u1', parent_id: 'p', docname: 'index.html', doctype: 'file',
        content: '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      },
    ],
    f1: [
      APP,
      {
        id: 'main', owner_id: 'u1', parent_id: 'f1', docname: 'main.tsx', doctype: 'file',
        content: "import { createRoot } from 'react-dom/client';\nimport App from './App';",
      },
    ],
  };

  function mockProject(options: { childrenStatus?: number; hold?: boolean; vite?: boolean } = {}) {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
      if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }), { status: 200 });
      if (url.includes('/documents/doc-1/yjs-state')) return new Response(JSON.stringify({ state: null }), { status: 200 });
      if (url.includes('/documents/doc-1/ws-ticket')) return new Response(JSON.stringify({ ticket: 't', role: 'owner', can_edit: true }), { status: 200 });
      if (url.match(/\/documents\/doc-1$/)) return new Response(JSON.stringify(APP), { status: 200 });

      const children = /\/documents\/([^/]+)\/children$/.exec(url);
      if (children) {
        if (options.hold) return new Promise<Response>(() => {});
        if (options.childrenStatus) {
          return new Response(JSON.stringify({ error: 'boom' }), { status: options.childrenStatus });
        }
        const listing = options.vite ? { ...CHILDREN, ...VITE_CHILDREN } : CHILDREN;
        return new Response(JSON.stringify(listing[children[1]] ?? []), { status: 200 });
      }

      const detail = /\/documents\/([^/]+)$/.exec(url);
      if (detail && FOLDERS[detail[1]]) return new Response(JSON.stringify(FOLDERS[detail[1]]), { status: 200 });
      return new Response('[]', { status: 200 });
    }));
  }

  function renderAndRun() {
    renderWithProviders(
      <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
      { route: '/editor/doc-1' },
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    // The run-scope choice is per session; one test's must not leak into the next.
    window.sessionStorage.clear();
  });

  test('loads the whole project and runs the file by its path in it', async () => {
    mockProject();
    const user = userEvent.setup();
    renderAndRun();

    await user.click(await screen.findByTestId('run-button'));

    const frame = await screen.findByTestId('preview-frame', {}, { timeout: 4000 });
    await waitFor(() => {
      const srcdoc = frame.getAttribute('srcdoc') ?? '';
      expect(srcdoc).toContain('data-entry="src/App.js"');
      // Resolved from src/, one folder up — not from the project root.
      expect(srcdoc).toContain('workspace:lib/util');
      expect(srcdoc).toContain('lib/util.js');
    }, { timeout: 4000 });
    // Another folder's stylesheet stays off the page.
    expect(frame.getAttribute('srcdoc')).not.toContain('.from-lib');
    expect(screen.getByTitle('src/App.tsx')).toBeInTheDocument();
  });

  test('shows the load instead of an earlier run while the project is fetched', async () => {
    mockProject({ hold: true });
    const user = userEvent.setup();
    renderAndRun();

    await user.click(await screen.findByTestId('run-button'));

    expect(await screen.findByTestId('preview-loading')).toHaveTextContent('Loading project…');
    expect(screen.queryByTestId('preview-frame')).not.toBeInTheDocument();
  });

  test('shows a failed load rather than swallowing it', async () => {
    mockProject({ childrenStatus: 500 });
    const user = userEvent.setup();
    renderAndRun();

    await user.click(await screen.findByTestId('run-button'));

    expect(await screen.findByTestId('preview-load-error', {}, { timeout: 4000 }))
      .toHaveTextContent(/could not load the project/i);
  });

  test('runs a Vite project from its index.html, and can switch to the open file', async () => {
    mockProject({ vite: true });
    const user = userEvent.setup();
    renderAndRun();

    await user.click(await screen.findByTestId('run-button'));

    const frame = await screen.findByTestId('preview-frame', {}, { timeout: 4000 });
    await waitFor(() => {
      expect(frame.getAttribute('srcdoc')).toContain('data-entry="src/main.js"');
    }, { timeout: 4000 });
    expect(screen.getByTestId('preview-entry')).toHaveTextContent('index.html');

    const toggle = screen.getByRole('button', { name: /run only src\/App\.tsx/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId('preview-frame').getAttribute('srcdoc')).toContain('data-entry="src/App.js"');
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
