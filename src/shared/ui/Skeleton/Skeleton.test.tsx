import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  test('renders without crashing', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });
});
