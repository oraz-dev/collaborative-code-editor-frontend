import { formatByteSize, mediaKindFor, mediaKindLabel, mediaSourceFor } from './mediaFile';

describe('mediaKindFor', () => {
  test('sorts media extensions into the three kinds', () => {
    expect(mediaKindFor('logo.svg')).toBe('image');
    expect(mediaKindFor('photo.JPEG')).toBe('image');
    expect(mediaKindFor('clip.mp4')).toBe('video');
    expect(mediaKindFor('theme.mp3')).toBe('audio');
  });

  test('leaves everything else to the editor', () => {
    expect(mediaKindFor('main.tsx')).toBeNull();
    expect(mediaKindFor('README.md')).toBeNull();
    expect(mediaKindFor('Makefile')).toBeNull();
  });

  test('names the kind for the toolbar', () => {
    expect(mediaKindLabel('video')).toBe('Video');
  });
});

describe('mediaSourceFor', () => {
  test('renders SVG markup as an encoded data URL', () => {
    const source = mediaSourceFor('logo.svg', '<svg viewBox="0 0 2 2"><rect width="2" height="2"/></svg>');

    expect(source).toMatchObject({ kind: 'image', mime: 'image/svg+xml', encoding: 'markup' });
    expect(source?.src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(source!.src.split(',')[1])).toContain('<rect');
  });

  test('takes a data URL as written, whitespace and all', () => {
    const source = mediaSourceFor('shot.png', '  data:image/png;base64,iVBORw0KG\n go==  ');

    expect(source?.src).toBe('data:image/png;base64,iVBORw0KGgo==');
    expect(source?.encoding).toBe('data-url');
  });

  test('reads the size out of a data URL header', () => {
    // 8 base64 characters with one pad character: 5 bytes.
    expect(mediaSourceFor('shot.png', 'data:image/png;base64,iVBORw0=')?.byteSize).toBe(5);
    expect(mediaSourceFor('a.svg', 'data:image/svg+xml,%3Csvg%3E')?.byteSize).toBe(5);
  });

  test('wraps bare base64 in a data URL typed from the extension', () => {
    const source = mediaSourceFor('clip.mp4', 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28y');

    expect(source).toMatchObject({ kind: 'video', encoding: 'base64' });
    expect(source?.src).toBe('data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28y');
  });

  test('links out to a file hosted elsewhere', () => {
    const source = mediaSourceFor('hero.jpg', 'https://example.com/hero.jpg\n');

    expect(source).toMatchObject({ encoding: 'link', src: 'https://example.com/hero.jpg' });
  });

  test('is not fooled by prose that happens to start with a link', () => {
    expect(mediaSourceFor('hero.jpg', 'https://example.com/hero.jpg is the original')).toBeNull();
  });

  test('refuses text that is not media, rather than showing a broken frame', () => {
    expect(mediaSourceFor('hero.png', 'TODO: export this from Figma')).toBeNull();
    expect(mediaSourceFor('hero.png', '   ')).toBeNull();
    // Long enough to look like base64, but `!` is not in the alphabet.
    expect(mediaSourceFor('hero.png', 'not-really-base64!!')).toBeNull();
  });

  test('an .svg holding something other than markup is still not an image', () => {
    expect(mediaSourceFor('logo.svg', '<html><body>nope</body></html>')).toBeNull();
  });

  test('ignores files the editor owns', () => {
    expect(mediaSourceFor('main.tsx', '<svg />')).toBeNull();
  });
});

describe('formatByteSize', () => {
  test('keeps small sizes exact and scales the rest', () => {
    expect(formatByteSize(812)).toBe('812 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(15 * 1024)).toBe('15 KB');
    expect(formatByteSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });

  test('never reads as a negative size', () => {
    expect(formatByteSize(-10)).toBe('0 B');
  });
});
