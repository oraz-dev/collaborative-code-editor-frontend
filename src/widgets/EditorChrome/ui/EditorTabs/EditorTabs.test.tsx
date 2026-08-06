import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorTabs } from './EditorTabs';

const TABS = [
  { id: 'a', name: 'index.ts' },
  { id: 'b', name: 'styles.scss' },
];

describe('EditorTabs', () => {
  test('renders nothing when no file is open', () => {
    render(<EditorTabs tabs={[]} activeId={null} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('editor-tabs')).not.toBeInTheDocument();
  });

  test('marks the open file as the selected tab', () => {
    render(<EditorTabs tabs={TABS} activeId="b" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('editor-tab-styles.scss')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('editor-tab-index.ts')).toHaveAttribute('aria-selected', 'false');
  });

  test('switches files when a tab is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<EditorTabs tabs={TABS} activeId="a" onSelect={onSelect} onClose={vi.fn()} />);

    await user.click(screen.getByTestId('editor-tab-styles.scss'));

    expect(onSelect).toHaveBeenCalledWith('b');
  });

  test('closing a tab does not also select it', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditorTabs tabs={TABS} activeId="a" onSelect={onSelect} onClose={onClose} />);

    await user.click(screen.getByLabelText('Close styles.scss'));

    expect(onClose).toHaveBeenCalledWith('b');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
