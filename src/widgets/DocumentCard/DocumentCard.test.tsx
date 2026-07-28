import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mapDocument } from '@/entities/Document';
import { DocumentCard } from './DocumentCard';

const file = mapDocument({
  id: 'doc-1',
  docname: 'index.ts',
  doctype: 'file',
  updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
});

const folder = mapDocument({ id: 'doc-2', docname: 'src', doctype: 'folder' });

describe('DocumentCard', () => {
  test('shows the name, kind and last change', () => {
    render(<DocumentCard document={file} onOpen={vi.fn()} />);

    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText(/updated 5 min ago/)).toBeInTheDocument();
  });

  test('omits the timestamp when the server has not set one', () => {
    render(<DocumentCard document={folder} onOpen={vi.fn()} />);

    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.queryByText(/updated/)).not.toBeInTheDocument();
  });

  test('opens on click and on keyboard activation', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DocumentCard document={file} onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: 'Open index.ts' }));
    expect(onOpen).toHaveBeenCalledWith(file);

    onOpen.mockClear();
    screen.getByRole('button', { name: 'Open index.ts' }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(file);
  });

  test('deletes without also opening the document', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<DocumentCard document={file} onOpen={onOpen} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: 'Delete index.ts' }));

    expect(onDelete).toHaveBeenCalledWith(file);
    expect(onOpen).not.toHaveBeenCalled();
  });

  test('marks an unsaved placeholder as busy and refuses to open it', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const pending = { ...file, id: 'optimistic:index.ts' };
    render(<DocumentCard document={pending} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: 'Open index.ts' });
    expect(card).toHaveAttribute('aria-busy', 'true');

    await user.click(card);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
