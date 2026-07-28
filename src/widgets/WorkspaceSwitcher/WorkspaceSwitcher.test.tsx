import { screen} from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

describe('WorkspaceSwitcher', () => {
  test('renders without crashing', () => {
    renderWithProviders(<WorkspaceSwitcher />);
    expect(screen.getByText('Space')).toBeInTheDocument();
  });
});
