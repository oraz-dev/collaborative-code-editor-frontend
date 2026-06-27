import { render, screen } from '@testing-library/react';
import { GitView } from './GitView';

describe('GitView', () => {
  test('renders without crashing', () => {
    render(<GitView />);
    expect(screen.getByText('Git')).toBeInTheDocument();
  });
});
