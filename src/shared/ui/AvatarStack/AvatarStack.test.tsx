import { render, screen } from '@testing-library/react';
import { AvatarStack } from './AvatarStack';

describe('AvatarStack', () => {
  test('renders without crashing', () => {
    const people = [{ id: '1', name: 'John Doe' }];
    render(<AvatarStack people={people} />);
    expect(screen.getByTitle('John Doe')).toBeInTheDocument();
  });
});
