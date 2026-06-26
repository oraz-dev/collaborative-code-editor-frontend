import { render, screen } from '@testing-library/react';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  test('renders without crashing', () => {
    render(<Tooltip content="Tooltip text"><span>Hover me</span></Tooltip>);
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });
});
