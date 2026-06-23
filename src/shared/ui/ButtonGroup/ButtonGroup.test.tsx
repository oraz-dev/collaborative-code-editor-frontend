import { render, screen } from '@testing-library/react';
import { ButtonGroup } from './ButtonGroup';

describe('ButtonGroup', () => {
  test('renders without crashing', () => {
    const options = [{ value: 'a', label: 'Option A' }];
    render(<ButtonGroup options={options} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });
});
