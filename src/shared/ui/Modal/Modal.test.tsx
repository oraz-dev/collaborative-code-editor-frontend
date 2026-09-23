import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  test('renders without crashing', () => {
    render(<Modal open={true} onClose={() => {}} title="Test Modal">Content</Modal>);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  describe('focus', () => {
    /** A page behind the scrim, which a Tab must never reach. */
    function renderWithBackground() {
      return render(
        <>
          <button type="button">behind</button>
          <Modal open onClose={() => {}} title="Test Modal" footer={<button type="button">Create</button>}>
            <button type="button">Inside</button>
          </Modal>
        </>,
      );
    }

    test('Tab stays inside the dialog rather than walking the page behind it', async () => {
      const user = userEvent.setup();
      renderWithBackground();

      screen.getByRole('button', { name: 'Create' }).focus();
      await user.tab();

      // Past the last control it wraps to the first, and never to "behind".
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'behind' }));
    });

    test('Shift+Tab from the first control wraps to the last', async () => {
      const user = userEvent.setup();
      renderWithBackground();

      screen.getByRole('button', { name: 'Close' }).focus();
      await user.tab({ shift: true });

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create' }));
    });

    test('a Tab with focus lost to the body comes back into the dialog', async () => {
      const user = userEvent.setup();
      renderWithBackground();

      // What happens by itself when the dialog swaps out the focused button.
      (document.activeElement as HTMLElement | null)?.blur();
      expect(document.activeElement).toBe(document.body);

      await user.tab();

      expect(screen.getByRole('button', { name: 'Close' })).toBe(document.activeElement);
    });
  });
});
