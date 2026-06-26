import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  test('renders without crashing', () => {
    render(<StatCard label="Users" value="1,234" />);
    expect(screen.getByText('Users')).toBeInTheDocument();
  });
});
