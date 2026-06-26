import { render, screen } from '@testing-library/react';
import { PresenceCursor } from './PresenceCursor';

describe('PresenceCursor', () => {
  test('renders without crashing', () => {
    render(<PresenceCursor name="Alice" color="#ff0000" x={100} y={200} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
