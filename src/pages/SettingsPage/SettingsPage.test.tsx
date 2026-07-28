import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  test('renders without crashing', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
