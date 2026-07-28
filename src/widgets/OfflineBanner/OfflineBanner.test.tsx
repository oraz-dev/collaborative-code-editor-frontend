import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { OfflineBanner } from './OfflineBanner';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('OfflineBanner', () => {
  afterEach(() => {
    setOnline(true);
  });

  test('stays out of the way while online', () => {
    setOnline(true);
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });

  test('reassures the user that work is not lost when offline', () => {
    setOnline(false);
    renderWithProviders(<OfflineBanner />);

    const banner = screen.getByTestId('offline-banner');
    expect(banner).toHaveTextContent("You're offline");
    expect(banner).toHaveTextContent('will sync when the connection returns');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });
});
