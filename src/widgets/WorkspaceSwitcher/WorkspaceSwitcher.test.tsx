import { render, screen } from '@testing-library/react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

describe('WorkspaceSwitcher', () => {
  test('renders without crashing', () => {
    render(<WorkspaceSwitcher />);
    expect(screen.getByText('Space')).toBeInTheDocument();
  });
});
