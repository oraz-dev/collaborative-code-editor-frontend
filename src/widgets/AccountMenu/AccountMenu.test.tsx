import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { tokenStore } from '@/shared/api';
import { AccountMenu } from './AccountMenu';

function mockSignedIn() {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith('/refresh')) {
      return new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 });
    }
    if (url.endsWith('/logout')) {
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({
        id: 'u1',
        email: 'ork@example.com',
        username: 'ork',
        display_name: 'Ork Hojamyradov',
      }),
      { status: 200 },
    );
  }));
}

describe('AccountMenu', () => {
  afterEach(() => {
    tokenStore.clear();
  });

  test('renders the account trigger', () => {
    renderWithProviders(<AccountMenu />);
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
  });

  test('shows the signed-in user rather than a placeholder', async () => {
    const user = userEvent.setup();
    mockSignedIn();
    renderWithProviders(<AccountMenu />);

    await user.click(screen.getByLabelText('Account'));

    await waitFor(() => {
      expect(screen.getByTestId('account-name')).toHaveTextContent('Ork Hojamyradov');
    });
    expect(screen.getByText('ork@example.com')).toBeInTheDocument();
  });

  test('signing out clears the stored token', async () => {
    const user = userEvent.setup();
    mockSignedIn();
    renderWithProviders(<AccountMenu />);

    await user.click(screen.getByLabelText('Account'));
    await waitFor(() => expect(screen.getByTestId('sign-out')).toBeInTheDocument());

    await user.click(screen.getByTestId('sign-out'));

    await waitFor(() => {
      expect(tokenStore.get()).toBeNull();
    });
  });
});
