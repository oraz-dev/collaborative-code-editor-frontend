import { render, screen } from '@testing-library/react';
import { Alert } from './Alert';

describe('Alert', () => {
  test('renders without crashing', () => {
    render(<Alert title="Test alert" />);
    expect(screen.getByText('Test alert')).toBeInTheDocument();
  });
});
