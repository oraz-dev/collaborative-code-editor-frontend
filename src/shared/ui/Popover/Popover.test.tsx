import { render, screen } from '@testing-library/react';
import { Popover } from './Popover';

describe('Popover', () => {
  test('renders without crashing', () => {
    render(<Popover title="Test Popover" />);
    expect(screen.getByText('Test Popover')).toBeInTheDocument();
  });
});
