import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  test('renders without crashing', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('has an Assistant section, which asks for no key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Assistant' }));

    expect(screen.getByTestId('ai-settings-section')).toBeInTheDocument();
    // The key is the server's: the section offers a connection test, not a field.
    expect(screen.queryByLabelText('OpenRouter API key')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test the connection to the assistant' }))
      .toBeInTheDocument();
  });
});
