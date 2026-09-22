import { render, screen } from '@testing-library/react';
import { EditorStatusBar } from './EditorStatusBar';

describe('EditorStatusBar', () => {
  test('names the language from the file extension', () => {
    render(<EditorStatusBar fileName="App.tsx" cursor={null} tabSize={2} />);
    expect(screen.getByTestId('status-language')).toHaveTextContent('TypeScript JSX');
  });

  test('shows the caret position', () => {
    render(
      <EditorStatusBar
        fileName="a.ts"
        cursor={{ line: 12, column: 4, selected: 0 }}
        tabSize={2}
      />,
    );
    expect(screen.getByTestId('status-position')).toHaveTextContent('Ln 12, Col 4');
  });

  test('reports the size of a selection', () => {
    render(
      <EditorStatusBar
        fileName="a.ts"
        cursor={{ line: 1, column: 1, selected: 18 }}
        tabSize={2}
      />,
    );
    expect(screen.getByTestId('status-position')).toHaveTextContent('18 selected');
  });

  test('omits the position until the editor reports one', () => {
    render(<EditorStatusBar fileName="a.ts" cursor={null} tabSize={2} />);
    expect(screen.queryByTestId('status-position')).not.toBeInTheDocument();
  });

  test('flags view-only access', () => {
    render(<EditorStatusBar fileName="a.ts" cursor={null} tabSize={2} readOnly />);
    expect(screen.getByTestId('editor-status-bar')).toHaveTextContent('Read only');
  });
});

describe('EditorStatusBar addons', () => {
  test('renders an item passed in at the start of the bar', () => {
    render(<EditorStatusBar fileName="a.ts" cursor={null} tabSize={2} addonLeft={<span>types</span>} />);
    expect(screen.getByText('types')).toBeInTheDocument();
  });
});
