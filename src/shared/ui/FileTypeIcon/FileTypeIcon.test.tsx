import { render } from '@testing-library/react';
import { fileTypeFor } from '@/shared/lib/fileType/fileType';
import { FileTypeIcon } from './FileTypeIcon';

describe('FileTypeIcon', () => {
  test('tints a file with its language colour', () => {
    const { container } = render(<FileTypeIcon name="App.tsx" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('stroke', fileTypeFor('App.tsx').color);
  });

  test('is hidden from assistive tech, since the file name is already read out', () => {
    const { container } = render(<FileTypeIcon name="App.tsx" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('draws a different folder shape when expanded', () => {
    const closed = render(<FileTypeIcon name="src" variant="folder" />);
    const open = render(<FileTypeIcon name="src" variant="folder" expanded />);

    const shapeOf = (result: ReturnType<typeof render>) => Array.from(
      result.container.querySelectorAll('path'),
    ).map((path) => path.getAttribute('d')).join('|');

    expect(shapeOf(open)).not.toBe(shapeOf(closed));
  });

  test('inherits colour for folders rather than tinting them', () => {
    const { container } = render(<FileTypeIcon name="src" variant="folder" />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
  });
});
