import { render } from '@testing-library/react';
import { Progress } from './Progress';

describe('Progress', () => {
  test('renders without crashing', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });
});
