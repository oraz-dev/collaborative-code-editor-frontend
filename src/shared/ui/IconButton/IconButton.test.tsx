import { render, screen } from '@testing-library/react';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  test('renders without crashing', () => {
    render(<IconButton aria-label="Close"><span>X</span></IconButton>);
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });
});
