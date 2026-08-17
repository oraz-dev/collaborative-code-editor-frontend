import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  test('renders without crashing', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  test('reports what was typed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input value="" onChange={onChange} placeholder="Enter text" />);

    await user.type(screen.getByPlaceholderText('Enter text'), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  test('sizing lands on the wrapper, which is the element being laid out', () => {
    // Applied to the inner field instead, a `flex: 1` from the caller did
    // nothing and the field overflowed its row.
    const { container } = render(<Input className="sized" />);
    expect(container.firstElementChild).toHaveClass('sized');
  });

  test('shows a validation message', () => {
    render(<Input error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
