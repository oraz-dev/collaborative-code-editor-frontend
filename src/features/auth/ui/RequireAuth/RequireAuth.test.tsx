import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { tokenStore } from '@/shared/api';
import { RequireAuth } from './RequireAuth';

describe('RequireAuth', () => {
  afterEach(() => {
    tokenStore.clear();
  });

  test('waits for the session to resolve before deciding', () => {
    renderWithProviders(<RequireAuth><div>secret</div></RequireAuth>);

    // must not redirect while the refresh cookie is still being tried
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  test('keeps protected content hidden when there is no session', async () => {
    renderWithProviders(<RequireAuth><div>secret</div></RequireAuth>);

    // the stubbed fetch answers 401, so no session can be restored
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  test('renders the protected content for a signed-in user', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/refresh')) {
        return new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ id: 'u1', email: 'ada@example.com', username: 'ada', display_name: 'Ada' }),
        { status: 200 },
      );
    }));

    renderWithProviders(<RequireAuth><div>secret</div></RequireAuth>);

    await waitFor(() => {
      expect(screen.getByText('secret')).toBeInTheDocument();
    });
  });
});
