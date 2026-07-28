import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { UpgradePage } from './UpgradePage';

describe('UpgradePage', () => {
  test('renders without crashing', () => {
    renderWithProviders(<UpgradePage />);
    expect(screen.getByText('Pricing')).toBeInTheDocument();
  });
});
