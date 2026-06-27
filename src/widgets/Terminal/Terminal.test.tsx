import { render, screen } from '@testing-library/react';
import { Terminal } from './Terminal';

describe('Terminal', () => {
  test('renders without crashing', () => {
    render(<Terminal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });
});
