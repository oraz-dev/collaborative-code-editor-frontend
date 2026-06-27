import { render } from '@testing-library/react';
import { Navigator } from './Navigator';

describe('Navigator', () => {
  test('renders without crashing', () => {
    const { container } = render(<Navigator activeFile="editor.tsx" onSelectFile={vi.fn()} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
