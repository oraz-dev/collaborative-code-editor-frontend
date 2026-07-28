import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { ProfilePage } from './ProfilePage';

describe('ProfilePage', () => {
  test('renders without crashing', () => {
    renderWithProviders(<ProfilePage />);
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});
