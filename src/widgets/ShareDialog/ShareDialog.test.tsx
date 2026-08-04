import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { mapDocument } from '@/entities/Document';
import { ShareDialog } from './ShareDialog';

const ownedDocument = mapDocument({
  id: 'doc-1',
  owner_id: 'me',
  docname: 'index.ts',
  doctype: 'file',
});

const sharedFolder = mapDocument({
  id: 'doc-2',
  owner_id: 'someone-else',
  docname: 'src',
  doctype: 'folder',
});

const COLLABORATORS = [
  { user_id: 'me', username: 'ork', display_name: 'Ork', role: 'owner' },
  { user_id: 'u2', username: 'ada', display_name: 'Ada Lovelace', role: 'editor' },
];

function mockApi(overrides: { collaborators?: unknown[] } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    if (url.includes('/collaborators')) {
      return new Response(JSON.stringify(overrides.collaborators ?? COLLABORATORS), { status: 200 });
    }
    if (url.includes('/users?query=')) {
      return new Response(
        JSON.stringify([{ id: 'u3', username: 'mira', display_name: 'Mira', email: 'mira@x.com' }]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  }));
}

describe('ShareDialog', () => {
  test('lists who currently has access', async () => {
    mockApi();
    renderWithProviders(
      <ShareDialog open onClose={vi.fn()} document={ownedDocument} isOwner currentUserId="me" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('collaborator-u2')).toHaveTextContent('Ada Lovelace');
    });
    expect(screen.getByTestId('collaborator-me')).toHaveTextContent('Owner');
  });

  test('marks the signed-in person as you', async () => {
    mockApi();
    renderWithProviders(
      <ShareDialog open onClose={vi.fn()} document={ownedDocument} isOwner currentUserId="me" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('collaborator-me')).toHaveTextContent('(you)');
    });
  });

  test('warns that sharing a folder shares everything inside it', async () => {
    mockApi();
    renderWithProviders(
      <ShareDialog open onClose={vi.fn()} document={sharedFolder} isOwner currentUserId="me" />,
    );

    expect(screen.getByText(/also gets access to everything inside/i)).toBeInTheDocument();
  });

  test('finds people to invite', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(
      <ShareDialog open onClose={vi.fn()} document={ownedDocument} isOwner currentUserId="me" />,
    );

    await user.type(screen.getByLabelText('Search people to share with'), 'mira');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share with Mira' })).toBeInTheDocument();
    });
  });

  test('hides the invite controls from someone who is not the owner', async () => {
    mockApi();
    renderWithProviders(
      <ShareDialog
        open
        onClose={vi.fn()}
        document={sharedFolder}
        isOwner={false}
        currentUserId="u2"
      />,
    );

    expect(screen.queryByLabelText('Search people to share with')).not.toBeInTheDocument();
    // …but they can still remove themselves
    expect(screen.getByRole('button', { name: 'Leave this document' })).toBeInTheDocument();
  });

  test('does not offer a leave button to the owner', async () => {
    mockApi();
    renderWithProviders(
      <ShareDialog open onClose={vi.fn()} document={ownedDocument} isOwner currentUserId="me" />,
    );

    expect(screen.queryByRole('button', { name: 'Leave this document' })).not.toBeInTheDocument();
  });
});
