import { render, screen, act, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ToastProvider';
import { useToast } from './toastContext';

function Trigger({ title = 'Shared with you' }: { title?: string }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast({ title, description: 'index.ts' })}>
      notify
    </button>
  );
}

describe('ToastProvider', () => {
  test('shows a toast when one is requested', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Trigger /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'notify' }));

    expect(screen.getByText('Shared with you')).toBeInTheDocument();
  });

  test('dismisses on request', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Trigger /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'notify' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // A dismissed toast stays mounted for its exit animation, so it leaves the
    // DOM a tick after the click rather than during it.
    await waitForElementToBeRemoved(() => screen.queryByText('Shared with you'));
  });

  test('clears itself after its duration', async () => {
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Trigger /></ToastProvider>);

      act(() => { screen.getByRole('button', { name: 'notify' }).click(); });
      expect(screen.getByText('Shared with you')).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(6500); });
      expect(screen.queryByText('Shared with you')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a component without the provider still renders', () => {
    // useToast falls back to a no-op rather than throwing.
    render(<Trigger />);
    expect(screen.getByRole('button', { name: 'notify' })).toBeInTheDocument();
  });
});
