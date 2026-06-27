import { render, screen, fireEvent } from '@testing-library/react';
import { CodeView } from './CodeView';
import type { FileData } from '@/shared/data/demo';

const mockFile: FileData = {
  path: ['src'],
  name: 'test.tsx',
  lang: 'tsx',
  editedBy: 'ada',
  editedAt: '1 min ago',
  lines: [[['p', 'hello']], [['k', 'world']]],
};

describe('CodeView', () => {
  test('renders without crashing', () => {
    render(<CodeView file={mockFile} activeLine={1} />);
    expect(screen.getByText('UTF-8')).toBeInTheDocument();
  });

  test('clicking a line opens an editable input', () => {
    render(<CodeView file={mockFile} activeLine={1} />);
    fireEvent.click(screen.getByText('hello'));
    expect(screen.getByRole('textbox', { name: /edit line 1/i })).toBeInTheDocument();
  });

  test('calls onFileChange when edit is committed via Enter', () => {
    const onChange = vi.fn();
    render(<CodeView file={mockFile} activeLine={1} onFileChange={onChange} />);
    fireEvent.click(screen.getByText('hello'));
    const input = screen.getByRole('textbox', { name: /edit line 1/i });
    fireEvent.change(input, { target: { value: 'new text' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalled();
    const newLines = onChange.mock.calls[0][0];
    expect(newLines[0]).toEqual([['p', 'new text']]);
  });

  test('pressing Escape cancels editing', () => {
    render(<CodeView file={mockFile} activeLine={1} />);
    fireEvent.click(screen.getByText('hello'));
    const input = screen.getByRole('textbox', { name: /edit line 1/i });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
