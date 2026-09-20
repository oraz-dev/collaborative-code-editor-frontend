import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { EditorPage } from './EditorPage';

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="monaco-stub" /> }));

const LANGUAGES = [
  { id: 71, name: 'Python (3.8.1)' },
  { id: 63, name: 'JavaScript (Node.js 12.14.0)' },
];

/** Captures the frames the page sends, and lets a test push frames back. */
class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  static readonly OPEN = 1;

  readyState = 1;
  binaryType = 'blob';
  sent: (string | ArrayBuffer)[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    FakeWebSocket.last = this;
    // Open on the next tick, the way a real handshake would.
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  /** The text frames the client sent — the control plane. */
  get controlFrames(): Record<string, unknown>[] {
    return this.sent
      .filter((frame): frame is string => typeof frame === 'string')
      .map((frame) => JSON.parse(frame));
  }

  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

interface ApiOptions {
  docName?: string;
  role?: 'owner' | 'editor' | 'viewer';
  languages?: { id: number; name: string }[];
  languagesStatus?: number;
}

function mockApi(options: ApiOptions = {}) {
  const {
    docName = 'main.py',
    role = 'owner',
    languages = LANGUAGES,
    languagesStatus = 200,
  } = options;

  const doc = {
    id: 'doc-1',
    owner_id: 'u1',
    parent_id: 'f1',
    docname: docName,
    doctype: 'file',
    content: "print('hi')",
  };

  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    if (url.endsWith('/auth/me')) {
      return new Response(
        JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }),
        { status: 200 },
      );
    }
    if (url.includes('/languages')) {
      return new Response(
        languagesStatus === 200 ? JSON.stringify(languages) : JSON.stringify({ error: 'no sandbox' }),
        { status: languagesStatus },
      );
    }
    if (url.includes('/documents/doc-1/yjs-state')) return new Response(JSON.stringify({ state: null }), { status: 200 });
    if (url.includes('/documents/doc-1/ws-ticket')) {
      return new Response(
        JSON.stringify({ ticket: 't', role, can_edit: role !== 'viewer' }),
        { status: 200 },
      );
    }
    if (url.match(/\/documents\/doc-1$/)) return new Response(JSON.stringify(doc), { status: 200 });
    return new Response('[]', { status: 200 });
  }));
}

function renderEditor() {
  return renderWithProviders(
    <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
    { route: '/editor/doc-1' },
  );
}

const RESULT = {
  stdout: 'hi\n',
  stderr: '',
  compile_output: '',
  message: '',
  status_id: 3,
  status: 'Accepted',
  time: '0.031',
  memory: 3200,
};

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.last = null;
});

function stubSocket() {
  vi.stubGlobal('WebSocket', FakeWebSocket);
}

describe('running a file on the server sandbox', () => {
  test('sends a run control frame carrying the language id and the live source', async () => {
    mockApi();
    stubSocket();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByTestId('run-button'));

    await waitFor(() => {
      expect(FakeWebSocket.last?.controlFrames.length).toBeGreaterThan(0);
    });

    expect(FakeWebSocket.last?.controlFrames[0]).toEqual({
      type: 'run',
      language_id: 71,
      source_code: "print('hi')",
    });
  });

  test('shows the output once the sandbox answers', async () => {
    mockApi();
    stubSocket();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByTestId('run-button'));
    expect(await screen.findByTestId('run-pending')).toBeInTheDocument();

    FakeWebSocket.last?.receive({ type: 'run:started', requested_by: 'u1', language_id: 71 });
    FakeWebSocket.last?.receive({ type: 'run:result', requested_by: 'u1', result: RESULT });

    expect(await screen.findByTestId('run-outcome')).toHaveTextContent('Finished');
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  test('renders a refusal instead of leaving the pane spinning', async () => {
    mockApi();
    stubSocket();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByTestId('run-button'));
    FakeWebSocket.last?.receive({
      type: 'error',
      code: 'run_failed',
      message: 'execution backend unavailable',
    });

    expect(await screen.findByTestId('run-failure')).toHaveTextContent(/could not be reached/i);
  });

  test("opens for a collaborator when the owner's run is broadcast", async () => {
    // Nobody here pressed anything — the frame arrives because a run is
    // broadcast to the whole room.
    mockApi({ role: 'editor' });
    stubSocket();
    renderEditor();

    // Wait for the socket the *live* provider owns. StrictMode mounts the
    // effect twice, and the first provider is torn down — frames pushed into
    // its socket are correctly ignored. A provider that has sent its opening
    // sync frames is the one still attached.
    await waitFor(() => {
      expect(FakeWebSocket.last?.sent.length ?? 0).toBeGreaterThan(0);
    });

    FakeWebSocket.last?.receive({ type: 'run:started', requested_by: 'someone-else', language_id: 71 });
    FakeWebSocket.last?.receive({ type: 'run:result', requested_by: 'someone-else', result: RESULT });

    expect(await screen.findByTestId('run-output-pane')).toBeInTheDocument();
    expect(await screen.findByTestId('run-outcome')).toHaveTextContent('Finished');
  });
});

describe('who may press Run', () => {
  test('an owner may', async () => {
    mockApi({ role: 'owner' });
    stubSocket();
    renderEditor();

    await waitFor(() => expect(screen.getByTestId('run-button')).toBeEnabled());
  });

  test('a collaborator is shown the rule rather than being refused after the fact', async () => {
    mockApi({ role: 'editor' });
    stubSocket();
    renderEditor();

    const button = await screen.findByTestId('run-button');
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAccessibleName(/only the owner/i);
  });
});

describe('choosing an engine', () => {
  test('an HTML file still uses the in-browser preview, not the sandbox', async () => {
    mockApi({ docName: 'index.html' });
    stubSocket();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByTestId('run-button'));

    expect(await screen.findByTestId('preview-pane')).toBeInTheDocument();
    expect(screen.queryByTestId('run-output-pane')).not.toBeInTheDocument();
    expect(FakeWebSocket.last?.controlFrames).toHaveLength(0);
  });

  test('a file no engine can run offers no Run button at all', async () => {
    mockApi({ docName: 'notes.md' });
    stubSocket();
    renderEditor();

    await waitFor(() => expect(screen.getByLabelText('Settings')).toBeInTheDocument());
    expect(screen.queryByTestId('run-button')).not.toBeInTheDocument();
  });

  test('no Run button when the sandbox has no language for the file', async () => {
    // A deployment that narrowed its allowlist, or has no sandbox at all.
    mockApi({ docName: 'main.py', languages: [{ id: 60, name: 'Go (1.13.5)' }] });
    stubSocket();
    renderEditor();

    await waitFor(() => expect(screen.getByLabelText('Settings')).toBeInTheDocument());
    expect(screen.queryByTestId('run-button')).not.toBeInTheDocument();
  });

  test('a failing /languages disables the sandbox but never the preview', async () => {
    mockApi({ docName: 'index.html', languagesStatus: 502 });
    stubSocket();
    renderEditor();

    // The browser preview is local; a broken sandbox must not cost it.
    await waitFor(() => expect(screen.getByTestId('run-button')).toBeEnabled());
  });
});
