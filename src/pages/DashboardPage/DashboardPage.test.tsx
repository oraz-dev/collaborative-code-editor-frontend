import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  test('renders the projects section', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  test('offers a retry when projects cannot be loaded', async () => {
    renderWithProviders(<DashboardPage />);

    // the default stubbed fetch fails, so the failure state should appear
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry loading projects' })).toBeInTheDocument();
  });
});
