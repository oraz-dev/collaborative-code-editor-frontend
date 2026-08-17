import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  test('renders the sign-in form', () => {
    renderWithProviders(<AuthPage />);
    expect(screen.getByText('Sign in to Space')).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  test('switches to the sign-up form and asks for a username', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuthPage />);

    await user.click(screen.getByTestId('auth-toggle'));

    expect(screen.getByText('Create your workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  test('keeps submit disabled until email and password are filled in', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuthPage />);

    const submit = screen.getByRole('button', { name: 'Sign in' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Work email'), 'ada@example.com');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Password'), 'hunter2');
    expect(submit).toBeEnabled();
  });

  test('explains a rejected sign-in instead of showing a raw status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuthPage />);

    await user.type(screen.getByLabelText('Work email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // the default stubbed fetch answers 401
    await waitFor(() => {
      expect(screen.getByTestId('auth-error')).toHaveTextContent(
        'That email and password do not match.',
      );
    });
  });
});
