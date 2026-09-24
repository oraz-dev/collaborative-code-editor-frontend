import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { Icons } from '@/shared/ui/Icon/Icons';
import { mapDocuments } from '@/entities/Document';
import { CommandPalette } from './CommandPalette';

const ROOTS = [
  { id: 'f1', owner_id: 'u1', docname: 'src', doctype: 'folder' },
  { id: 'd1', owner_id: 'u1', docname: 'index.ts', doctype: 'file' },
  { id: 'd2', owner_id: 'u1', docname: 'README.md', doctype: 'file' },
];

function mockDocuments() {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (String(input).endsWith('/documents/roots')) {
      return new Response(JSON.stringify(ROOTS), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }));
}

describe('CommandPalette', () => {
  test('renders nothing while closed', () => {
    mockDocuments();
    renderWithProviders(<CommandPalette open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('command-palette-input')).not.toBeInTheDocument();
  });

  test('lists the real documents from the workspace', async () => {
    mockDocuments();
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('palette-doc-index.ts')).toBeInTheDocument();
    });
    expect(screen.getByTestId('palette-doc-src')).toBeInTheDocument();
  });

  test('filters as the user types', async () => {
    const user = userEvent.setup();
    mockDocuments();
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('palette-doc-index.ts')).toBeInTheDocument());

    await user.type(screen.getByTestId('command-palette-input'), 'read');

    await waitFor(() => {
      expect(screen.queryByTestId('palette-doc-index.ts')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('palette-doc-README.md')).toBeInTheDocument();
  });

  test('says so when nothing matches', async () => {
    const user = userEvent.setup();
    mockDocuments();
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />);

    await user.type(screen.getByTestId('command-palette-input'), 'zzzzzz');

    await waitFor(() => {
      expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument();
    });
  });

  test('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockDocuments();
    renderWithProviders(<CommandPalette open onClose={onClose} />);

    await user.type(screen.getByTestId('command-palette-input'), '{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  test('opens the highlighted document on Enter', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockDocuments();
    renderWithProviders(<CommandPalette open onClose={onClose} />);

    await waitFor(() => expect(screen.getByTestId('palette-doc-index.ts')).toBeInTheDocument());

    await user.type(screen.getByTestId('command-palette-input'), 'index{Enter}');

    expect(onClose).toHaveBeenCalled();
  });

  test('runs a command a page handed in', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const run = vi.fn();
    mockDocuments();
    renderWithProviders(
      <CommandPalette
        open
        onClose={onClose}
        commands={[{ id: 'ai', label: 'Generate project with AI', icon: Icons.Sparkle, run }]}
      />,
    );

    await user.click(await screen.findByText('Generate project with AI'));

    expect(run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('always offers the navigation actions', async () => {
    mockDocuments();
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />);
    expect(await screen.findByText('Open settings')).toBeInTheDocument();
  });
});

describe('telling same-named results apart', () => {
  /** Two projects, each with a `src` — the case that made search useless. */
  const PROJECTS = [
    { id: 'p1', owner_id: 'u1', docname: 'kanban-pro', doctype: 'folder' },
    { id: 'p2', owner_id: 'u1', docname: 'vite-react-demo', doctype: 'folder' },
  ];
  const CHILDREN: Record<string, unknown[]> = {
    p1: [{ id: 's1', owner_id: 'u1', parent_id: 'p1', docname: 'src', doctype: 'folder' }],
    p2: [{ id: 's2', owner_id: 'u1', parent_id: 'p2', docname: 'src', doctype: 'folder' }],
  };

  function mockProjects() {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/documents/roots')) return new Response(JSON.stringify(PROJECTS), { status: 200 });
      const children = /\/documents\/([^/]+)\/children$/.exec(url);
      if (children) return new Response(JSON.stringify(CHILDREN[children[1]] ?? []), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    }));
  }

  test('each result says which project it belongs to', async () => {
    const user = userEvent.setup();
    mockProjects();
    // Not the shared test client: its gcTime of 0 drops data that has no
    // observer, and the children below are seeded rather than subscribed.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />, { client: queryClient });
    // Both folders have been opened this session, which is what puts their
    // children in the cache the search reads.
    queryClient.setQueryData(['documents', 'children', 'p1'], mapDocuments(CHILDREN.p1 as never));
    queryClient.setQueryData(['documents', 'children', 'p2'], mapDocuments(CHILDREN.p2 as never));

    await user.type(screen.getByTestId('command-palette-input'), 'src');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'src, in kanban-pro' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'src, in vite-react-demo' })).toBeInTheDocument();
  });
});
