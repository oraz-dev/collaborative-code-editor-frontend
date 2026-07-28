import { render, screen } from '@testing-library/react';
import { ConnectionBadge } from './ConnectionBadge';

describe('ConnectionBadge', () => {
  test('shows a live state with the number of other people', () => {
    render(<ConnectionBadge status="connected" peerCount={2} />);
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('Live');
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('2 others');
  });

  test('uses the singular for a single collaborator', () => {
    render(<ConnectionBadge status="connected" peerCount={1} />);
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('1 other');
  });

  test('omits the peer count when nobody else is present', () => {
    render(<ConnectionBadge status="connected" peerCount={0} />);
    expect(screen.getByTestId('connection-badge')).not.toHaveTextContent('other');
  });

  test('frames a dropped connection as reconnecting, never as a dead end', () => {
    // the provider always retries, so the wording must not imply lost work
    render(<ConnectionBadge status="offline" />);
    const badge = screen.getByTestId('connection-badge');
    expect(badge).toHaveTextContent('Reconnecting…');
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('edits are kept'));
  });

  test('announces status changes to assistive tech', () => {
    render(<ConnectionBadge status="connecting" />);
    expect(screen.getByTestId('connection-badge')).toHaveAttribute('aria-live', 'polite');
  });
});
