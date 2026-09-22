import { render } from '@testing-library/react';
import { Progress } from './Progress';

describe('Progress', () => {
  test('renders without crashing', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });
});

describe('Progress, labelled and clamped', () => {
  test('names itself and reports a whole, in-range value', () => {
    const { getByRole } = render(<Progress value={42.6} label="Downloading types" />);
    const bar = getByRole('progressbar', { name: 'Downloading types' });
    expect(bar).toHaveAttribute("aria-valuenow", "43");
  });

  test('never reports past 100', () => {
    const { getByRole } = render(<Progress value={250} />);
    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  test('an indeterminate bar has no value', () => {
    const { getByRole } = render(<Progress indeterminate />);
    expect(getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
});
