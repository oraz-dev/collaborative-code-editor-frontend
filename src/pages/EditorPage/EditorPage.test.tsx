import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { EditorPage } from './EditorPage';

// Monaco pulls a large editor bundle and touches APIs jsdom lacks; the binding
// itself is covered where it matters, in the collaboration feature.
vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-stub" />,
}));

describe('EditorPage', () => {
  test('renders the workspace chrome', () => {
    renderWithProviders(<EditorPage />);
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  test('invites the user to pick a file when no document is open', () => {
    renderWithProviders(<EditorPage />);
    expect(screen.getByTestId('editor-empty')).toHaveTextContent('Pick a file to start editing.');
  });
});
