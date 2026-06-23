import { render, screen } from '@testing-library/react';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  test('renders without crashing', () => {
    render(<Toggle label="Test Toggle" />);
    expect(screen.getByText('Test Toggle')).toBeInTheDocument();
  });
});
