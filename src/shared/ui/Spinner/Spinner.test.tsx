import { render } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  test('renders without crashing', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });
});
