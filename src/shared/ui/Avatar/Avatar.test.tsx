import { render, screen } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  test('renders without crashing', () => {
    const { container } = render(<Avatar initials="AB" />);
    expect(container.querySelector('.avatar')).toBeInTheDocument();
  });

  test('shows the initials it was given', () => {
    render(<Avatar initials="AB" />);
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  test('takes a presence colour as its fill', () => {
    const { container } = render(<Avatar initials="AB" color="#9d7cff" />);
    const avatar = container.querySelector('.avatar');
    expect(avatar).toHaveClass('hasColor');
    expect(avatar).toHaveStyle({ '--avatar-bg': '#9d7cff' });
  });

  test('an uncoloured avatar is not left transparent', () => {
    // It used to be dark ink on no background, so it read as a hole in the row.
    const { container } = render(<Avatar initials="AB" />);
    expect(container.querySelector('.avatar')).not.toHaveClass('hasColor');
  });

  test('prefers an image over initials', () => {
    render(<Avatar initials="AB" src="/me.png" alt="Ada" />);
    expect(screen.getByAltText('Ada')).toBeInTheDocument();
  });
});
