import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  test('renders without crashing', () => {
    render(<Card title="Test Card" />);
    expect(screen.getByText('Test Card')).toBeInTheDocument();
  });
});
