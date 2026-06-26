import { render, screen } from '@testing-library/react';
import { Tag } from './Tag';

describe('Tag', () => {
  test('renders without crashing', () => {
    render(<Tag>Test Tag</Tag>);
    expect(screen.getByText('Test Tag')).toBeInTheDocument();
  });
});
