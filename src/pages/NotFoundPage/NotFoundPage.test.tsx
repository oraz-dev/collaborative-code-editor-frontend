import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  test('explains the miss and offers a way back', () => {
    renderWithProviders(<NotFoundPage />);

    expect(screen.getByTestId('not-found-page')).toHaveTextContent('404');
    expect(screen.getByRole('button', { name: 'Back to your workspace' })).toBeInTheDocument();
  });
});
