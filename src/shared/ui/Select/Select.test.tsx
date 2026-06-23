import { render, screen } from '@testing-library/react';
import { Select } from './Select';

describe('Select', () => {
  test('renders without crashing', () => {
    const options = [
      { value: '1', label: 'Option 1' },
      { value: '2', label: 'Option 2' },
    ];
    render(<Select options={options} />);
    expect(screen.getByText('Select an option...')).toBeInTheDocument();
  });
});
