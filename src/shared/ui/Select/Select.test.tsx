import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

const OPTIONS = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
];

describe('Select', () => {
  test('renders without crashing', () => {
    render(<Select options={OPTIONS} />);
    expect(screen.getByText('Select an option...')).toBeInTheDocument();
  });

  test('shows the selected label', () => {
    render(<Select options={OPTIONS} value="2" />);
    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  test('reports the chosen value and closes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Select options={OPTIONS} value="1" onChange={onChange} />);

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('option', { name: 'Option 2' }));

    expect(onChange).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('escapes its container so a scrolling list cannot clip it', async () => {
    const user = userEvent.setup();
    render(
      <div style={{ overflow: 'hidden' }} data-testid="clipper">
        <Select options={OPTIONS} value="1" />
      </div>,
    );

    await user.click(screen.getByRole('button'));

    // The menu is portalled to the body, not left inside the clipping ancestor.
    const clipper = screen.getByTestId('clipper');
    expect(clipper).not.toContainElement(screen.getByRole('listbox'));
  });

  test('sizing lands on the wrapper, which is the element being laid out', () => {
    const { container } = render(<Select className="sized" options={OPTIONS} />);
    // A width on the trigger alone left the wrapper free to crush its siblings.
    expect(container.firstElementChild).toHaveClass('sized');
  });

  test('closes on Escape without letting an enclosing modal see it', async () => {
    const onParentKeyDown = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={onParentKeyDown}>
        <Select options={OPTIONS} value="1" />
      </div>,
    );

    await user.click(screen.getByRole('button'));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  test('does not open when read only', async () => {
    const user = userEvent.setup();
    render(<Select options={OPTIONS} value="1" readonly />);

    await user.click(screen.getByRole('button'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
