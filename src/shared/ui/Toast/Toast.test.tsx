import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  test('renders without crashing', () => {
    render(<Toast title="Test Toast" />);
    expect(screen.getByText('Test Toast')).toBeInTheDocument();
  });
});
