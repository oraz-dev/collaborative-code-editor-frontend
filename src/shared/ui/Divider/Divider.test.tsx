import { render } from '@testing-library/react';
import { Divider } from './Divider';

describe('Divider', () => {
  test('renders without crashing', () => {
    const { container } = render(<Divider />);
    expect(container.querySelector('[role="separator"]')).toBeInTheDocument();
  });
});
