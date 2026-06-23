import { render } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  test('renders without crashing', () => {
    const { container } = render(<Textarea placeholder="Enter text" />);
    expect(container.querySelector('textarea')).toBeInTheDocument();
  });
});
