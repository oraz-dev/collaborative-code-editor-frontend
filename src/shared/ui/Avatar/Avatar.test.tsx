import { render } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  test('renders without crashing', () => {
    const { container } = render(<Avatar initials="AB" />);
    expect(container.querySelector('.avatar')).toBeInTheDocument();
  });
});
