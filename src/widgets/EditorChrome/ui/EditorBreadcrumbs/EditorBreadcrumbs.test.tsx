import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorBreadcrumbs, type BreadcrumbSegment } from './EditorBreadcrumbs';

const SEGMENTS: BreadcrumbSegment[] = [
  { id: 'root', name: 'src', kind: 'folder' },
  { id: 'file', name: 'index.ts', kind: 'file' },
];

describe('EditorBreadcrumbs', () => {
  test('renders nothing without a path', () => {
    render(<EditorBreadcrumbs segments={[]} />);
    expect(screen.queryByTestId('editor-breadcrumbs')).not.toBeInTheDocument();
  });

  test('marks the open file as the current page', () => {
    render(<EditorBreadcrumbs segments={SEGMENTS} />);
    expect(screen.getByRole('button', { name: /index\.ts/ })).toHaveAttribute('aria-current', 'page');
  });

  test('opens an ancestor folder when it is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<EditorBreadcrumbs segments={SEGMENTS} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /src/ }));

    expect(onSelect).toHaveBeenCalledWith(SEGMENTS[0]);
  });

  test('shows unresolved ancestors as an inert ellipsis', () => {
    render(
      <EditorBreadcrumbs
        segments={[{ id: 'gap', name: '…', kind: 'folder', elided: true }, ...SEGMENTS]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '…' })).toBeDisabled();
  });
});
