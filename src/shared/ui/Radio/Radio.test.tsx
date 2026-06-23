import { render, screen } from '@testing-library/react';
import { Radio } from './Radio';

describe('Radio', () => {
  test('renders without crashing', () => {
    render(<Radio label="Test Radio" />);
    expect(screen.getByText('Test Radio')).toBeInTheDocument();
  });
});
