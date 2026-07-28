import { screen} from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  test('renders without crashing', () => {
    renderWithProviders(<AccountMenu />);
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
  });
});
