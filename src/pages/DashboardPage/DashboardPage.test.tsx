import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  test('renders the projects section', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  test('offers the AI project generator beside New file', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);

    expect(screen.getByTestId('generate-with-ai')).toBeInTheDocument();
    expect(screen.queryByTestId('generate-project-dialog')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('generate-with-ai'));

    // Nothing to set up first: the assistant runs on the server's key.
    expect(screen.getByTestId('generate-project-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('ai-request')).toBeInTheDocument();
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
