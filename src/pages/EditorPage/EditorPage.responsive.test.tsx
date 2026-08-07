import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { VIEWPORT, mockViewportWidth } from '@/shared/lib/tests/viewport';
import { EditorPage } from './EditorPage';

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="monaco-stub" /> }));

const DOC = {
  id: 'doc-1', owner_id: 'u1', parent_id: 'f1',
  docname: 'main.ts', doctype: 'file', content: 'const a = 1',
};

function mockApi() {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    if (url.endsWith('/auth/me')) {
      return new Response(
        JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }),
        { status: 200 },
      );
    }
    if (url.includes('/documents/doc-1/yjs-state')) return new Response(JSON.stringify({ state: null }), { status: 200 });
    if (url.includes('/documents/doc-1/ws-ticket')) {
      return new Response(JSON.stringify({ ticket: 't', role: 'owner', can_edit: true }), { status: 200 });
    }
    if (url.match(/\/documents\/doc-1$/)) return new Response(JSON.stringify(DOC), { status: 200 });
    return new Response('[]', { status: 200 });
  }));
}

function renderEditor() {
  return renderWithProviders(
    <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
    { route: '/editor/doc-1' },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EditorPage on a desktop', () => {
  test('shows the tree as a pane, with no drawer toggle', async () => {
    mockViewportWidth(VIEWPORT.desktop);
    mockApi();
    renderEditor();

    await waitFor(() => expect(screen.getByTestId('document-tree')).toBeInTheDocument());
    expect(screen.queryByLabelText('Open file tree')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Resize file tree')).toBeInTheDocument();
  });
});

describe('EditorPage on a phone', () => {
  test('replaces the tree pane with a drawer, and drops the resize handle', async () => {
    mockViewportWidth(VIEWPORT.phone);
    mockApi();
    renderEditor();

    await waitFor(() => expect(screen.getByLabelText('Open file tree')).toBeInTheDocument());

    // The pane is gone — dragging a 390px viewport into two columns is not a
    // layout anyone can use.
    expect(screen.queryByTestId('document-tree')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Resize file tree')).not.toBeInTheDocument();
  });

  test('opens and closes the drawer', async () => {
    mockViewportWidth(VIEWPORT.phone);
    mockApi();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByLabelText('Open file tree'));

    const drawer = screen.getByTestId('tree-drawer');
    expect(drawer).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByTestId('document-tree')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Close file tree'));
    expect(screen.queryByTestId('tree-drawer')).not.toBeInTheDocument();
  });

  test('Escape closes the drawer', async () => {
    mockViewportWidth(VIEWPORT.phone);
    mockApi();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByLabelText('Open file tree'));
    expect(screen.getByTestId('tree-drawer')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('tree-drawer')).not.toBeInTheDocument();
  });

  test('does not advertise the ⌘K shortcut', async () => {
    mockViewportWidth(VIEWPORT.phone);
    mockApi();
    renderEditor();

    await waitFor(() => expect(screen.getByLabelText('Search files')).toBeInTheDocument());
    expect(screen.getByLabelText('Search files')).not.toHaveTextContent('⌘');
  });

  test('runs the preview as a full-width sheet rather than a split pane', async () => {
    mockViewportWidth(VIEWPORT.phone);
    mockApi();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByTestId('run-button'));

    expect(await screen.findByTestId('preview-overlay')).toBeInTheDocument();
    expect(screen.queryByLabelText('Resize preview')).not.toBeInTheDocument();
  });
});

describe('EditorPage on a tablet', () => {
  test('uses the drawer too — two panes plus a preview do not fit', async () => {
    mockViewportWidth(VIEWPORT.tablet);
    mockApi();
    renderEditor();

    await waitFor(() => expect(screen.getByLabelText('Open file tree')).toBeInTheDocument());
    expect(screen.queryByLabelText('Resize file tree')).not.toBeInTheDocument();
  });
});
