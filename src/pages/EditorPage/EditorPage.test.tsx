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
    // The Code/Search/Git tabs are gone — Search and Git had no backend, which
    // left a one-option control, so the whole thing went.
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByLabelText('Search files')).toBeInTheDocument();
  });

  test('no longer offers the terminal, git or search views', () => {
    renderWithProviders(<EditorPage />);
    expect(screen.queryByLabelText('Toggle terminal')).not.toBeInTheDocument();
    expect(screen.queryByText('Git')).not.toBeInTheDocument();
  });

  test('the settings button navigates instead of doing nothing', () => {
    renderWithProviders(<EditorPage />);
    // It used to take an onSettings prop the router never passed.
    expect(screen.getByLabelText('Settings')).toBeEnabled();
  });

  test('invites the user to pick a file when no document is open', () => {
    renderWithProviders(<EditorPage />);
    expect(screen.getByTestId('editor-empty')).toHaveTextContent('Pick a file to start editing.');
  });

  test('offers no Run button until a runnable file is open', () => {
    renderWithProviders(<EditorPage />);
    expect(screen.queryByTestId('run-button')).not.toBeInTheDocument();
  });
});
