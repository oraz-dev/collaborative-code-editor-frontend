import { render, screen } from '@testing-library/react';
import { NewProjectModal } from './NewProjectModal';

describe('NewProjectModal', () => {
  test('renders without crashing', () => {
    render(<NewProjectModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('New project')).toBeInTheDocument();
  });
});
