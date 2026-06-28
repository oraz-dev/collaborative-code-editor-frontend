import { render, screen } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';

describe('ProfilePage', () => {
  test('renders without crashing', () => {
    render(<ProfilePage onBack={vi.fn()} />);
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});
