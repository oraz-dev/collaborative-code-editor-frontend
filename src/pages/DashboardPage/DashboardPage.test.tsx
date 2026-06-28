import { render, screen } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  test('renders without crashing', () => {
    render(<DashboardPage onOpenProject={vi.fn()} />);
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });
});
