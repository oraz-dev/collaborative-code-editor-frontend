import { render } from '@testing-library/react';
import { Icon } from './Icon';

describe('Icon', () => {
  test('renders without crashing', () => {
    const { container } = render(<Icon name="check" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
