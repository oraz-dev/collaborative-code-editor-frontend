import { render } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  test('renders without crashing', () => {
    const { container } = render(<Logo />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
