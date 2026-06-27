import { render, screen } from '@testing-library/react';
import { CommentsMargin } from './CommentsMargin';

describe('CommentsMargin', () => {
  test('renders without crashing', () => {
    render(<CommentsMargin comments={[]} />);
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });
});
