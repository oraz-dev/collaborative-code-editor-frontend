import { render, screen } from '@testing-library/react';
import { Kbd } from './Kbd';

describe('Kbd', () => {
  test('renders without crashing', () => {
    render(<Kbd keys={['Ctrl', 'S']} />);
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
  });
});
