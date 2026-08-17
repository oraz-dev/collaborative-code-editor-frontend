import { screen} from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { AppBar } from './AppBar';

describe('AppBar', () => {
  test('renders without crashing', () => {
    renderWithProviders(<AppBar />);
    expect(screen.getByText('Space')).toBeInTheDocument();
  });
});
