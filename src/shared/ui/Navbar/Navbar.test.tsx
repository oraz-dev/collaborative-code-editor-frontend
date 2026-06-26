import { render } from '@testing-library/react';
import { Navbar } from './Navbar';

describe('Navbar', () => {
  test('renders without crashing', () => {
    const { container } = render(<Navbar />);
    expect(container.querySelector('nav')).toBeInTheDocument();
  });
});
