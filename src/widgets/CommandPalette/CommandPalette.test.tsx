import { render, screen } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  test('renders without crashing', () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Command palette')).toBeInTheDocument();
  });
});
