import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { DocumentTree } from './DocumentTree';

const ROOTS = [
  { id: 'folder-1', owner_id: 'u1', docname: 'src', doctype: 'folder' },
  { id: 'file-1', owner_id: 'u1', docname: 'README.md', doctype: 'file' },
];

const CHILDREN = [
  { id: 'file-2', owner_id: 'u1', parent_id: 'folder-1', docname: 'index.ts', doctype: 'file' },
];

function mockApi(overrides: { failRoots?: boolean; stallCreate?: boolean } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/documents') && init?.method === 'POST') {
      // Holding the response open keeps the optimistic placeholder on screen
      // long enough to assert on it.
      if (overrides.stallCreate) await new Promise(() => {});
      return new Response(JSON.stringify({ id: 'new-1' }), { status: 201 });
    }

    if (url.endsWith('/documents/roots')) {
      if (overrides.failRoots) {
        return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      }
      return new Response(JSON.stringify(ROOTS), { status: 200 });
    }

    if (url.includes('/children')) {
      return new Response(JSON.stringify(CHILDREN), { status: 200 });
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  }));
}

describe('DocumentTree', () => {
  test('lists the workspace roots with folders first', async () => {
    mockApi();
    renderWithProviders(
      <DocumentTree ownerId="u1" onSelectDocument={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('tree-node-src')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tree-node-README.md')).toBeInTheDocument();
  });

  test('loads a folder’s children only once it is opened', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<DocumentTree ownerId="u1" onSelectDocument={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('tree-node-src')).toBeInTheDocument());
    expect(screen.queryByTestId('tree-node-index.ts')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tree-node-src'));

    await waitFor(() => {
      expect(screen.getByTestId('tree-node-index.ts')).toBeInTheDocument();
    });
  });

  test('selects a file rather than expanding it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockApi();
    renderWithProviders(<DocumentTree ownerId="u1" onSelectDocument={onSelect} />);

    await waitFor(() => expect(screen.getByTestId('tree-node-README.md')).toBeInTheDocument());
    await user.click(screen.getByTestId('tree-node-README.md'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }));
  });

  test('shows the new file straight away, before the server confirms', async () => {
    const user = userEvent.setup();
    mockApi({ stallCreate: true });
    renderWithProviders(<DocumentTree ownerId="u1" onSelectDocument={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('tree-node-src')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'New file' }));
    await user.type(screen.getByTestId('inline-name-input'), 'draft.ts{Enter}');

    // optimistic placeholder appears without waiting for the round trip
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-draft.ts')).toBeInTheDocument();
    });
  });

  test('offers a retry when the tree cannot be loaded', async () => {
    mockApi({ failRoots: true });
    renderWithProviders(<DocumentTree ownerId="u1" onSelectDocument={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry loading files' })).toBeInTheDocument();
    });
  });
});
