import { extensionOf, fileTypeFor } from './fileType';

describe('extensionOf', () => {
  test('reads the last extension', () => {
    expect(extensionOf('index.module.scss')).toBe('scss');
  });

  test('treats a dotfile as having no extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
  });

  test('returns nothing for a bare name', () => {
    expect(extensionOf('Makefile')).toBe('');
  });
});

describe('fileTypeFor', () => {
  test('maps a known extension to its glyph and colour', () => {
    expect(fileTypeFor('App.tsx')).toMatchObject({ glyph: 'braces', label: 'TypeScript JSX' });
  });

  test('prefers a whole-name match over the extension', () => {
    // package.json and tsconfig.json are both .json but read differently.
    expect(fileTypeFor('package.json').color).not.toBe(fileTypeFor('data.json').color);
  });

  test('is case insensitive', () => {
    expect(fileTypeFor('README.MD').label).toBe('Markdown');
  });

  test('falls back to a generic document', () => {
    expect(fileTypeFor('notes.unknownext').label).toBe('Plain Text');
  });
});
