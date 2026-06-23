import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  test('renders without crashing', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });
});
