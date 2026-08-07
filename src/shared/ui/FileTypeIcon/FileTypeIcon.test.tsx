import { render } from '@testing-library/react';
import { fileTypeFor } from '@/shared/lib/fileType/fileType';
import { FileTypeIcon } from './FileTypeIcon';

describe('FileTypeIcon', () => {
  test('tints a drawn glyph with its language colour', () => {
    const { container } = render(<FileTypeIcon name="styles.css" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('stroke', fileTypeFor('styles.css').color);
  });

  test('draws a lettermark for a language that would otherwise share a shape', () => {
    const { container } = render(<FileTypeIcon name="App.tsx" />);
    const text = container.querySelector('text');

    expect(text).toHaveTextContent('TSX');
    expect(text).toHaveAttribute('fill', fileTypeFor('App.tsx').color);
  });

  test('.ts and .js are distinguishable by shape, not only colour', () => {
    const ts = render(<FileTypeIcon name="a.ts" />).container.querySelector('text');
    const js = render(<FileTypeIcon name="a.js" />).container.querySelector('text');

    expect(ts).toHaveTextContent('TS');
    expect(js).toHaveTextContent('JS');
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
