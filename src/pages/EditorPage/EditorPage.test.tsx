import { render, screen } from '@testing-library/react';
import { EditorPage } from './EditorPage';

describe('EditorPage', () => {
  test('renders without crashing', () => {
    render(<EditorPage onBack={vi.fn()} />);
    expect(screen.getByText('Code')).toBeInTheDocument();
  });
});
