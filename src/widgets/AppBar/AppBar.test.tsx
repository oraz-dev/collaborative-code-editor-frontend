import { render, screen } from '@testing-library/react';
import { AppBar } from './AppBar';

describe('AppBar', () => {
  test('renders without crashing', () => {
    render(<AppBar />);
    expect(screen.getByText('Space')).toBeInTheDocument();
  });
});
