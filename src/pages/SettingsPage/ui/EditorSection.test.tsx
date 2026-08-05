import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { preferencesStore } from '@/features/preferences';
import { EditorSection } from './EditorSection';

describe('EditorSection', () => {
  beforeEach(() => {
    localStorage.clear();
    preferencesStore.reload();
  });

  test('renders the editor preferences', () => {
    render(<EditorSection />);
    expect(screen.getByText('Font family')).toBeInTheDocument();
    expect(screen.getByText('Font size')).toBeInTheDocument();
    expect(screen.getByText('Tab size')).toBeInTheDocument();
  });

  test('saves a font size change', async () => {
    const user = userEvent.setup();
    render(<EditorSection />);

    await user.click(screen.getByText('13 px'));
    await user.click(screen.getByText('18 px'));

    expect(preferencesStore.get().editor.fontSize).toBe(18);
  });

  test('saves a toggle change', async () => {
    const user = userEvent.setup();
    render(<EditorSection />);

    expect(preferencesStore.get().editor.wordWrap).toBe(false);
    await user.click(screen.getByLabelText('Word wrap'));

    expect(preferencesStore.get().editor.wordWrap).toBe(true);
  });

  test('saves the live cursor preference', async () => {
    const user = userEvent.setup();
    render(<EditorSection />);

    await user.click(screen.getByLabelText('Show live cursors'));

    expect(preferencesStore.get().collaboration.liveCursors).toBe(false);
  });

  test('disables cursor labels when cursors are hidden, since they would have nothing to label', async () => {
    const user = userEvent.setup();
    render(<EditorSection />);

    expect(screen.getByLabelText('Cursor labels')).toBeEnabled();
    await user.click(screen.getByLabelText('Show live cursors'));

    expect(screen.getByLabelText('Cursor labels')).toBeDisabled();
  });

  test('no longer offers inline comments, which had no backend', () => {
    render(<EditorSection />);
    expect(screen.queryByText('Inline comments')).not.toBeInTheDocument();
  });
});
