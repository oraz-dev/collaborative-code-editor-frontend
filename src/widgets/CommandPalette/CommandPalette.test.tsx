import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { Icons } from '@/shared/ui/Icon/Icons';
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
