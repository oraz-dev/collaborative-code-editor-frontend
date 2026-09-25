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
    expect(fileTypeFor('styles.css')).toMatchObject({ glyph: 'hash', label: 'CSS' });
    expect(fileTypeFor('App.tsx')).toMatchObject({ glyph: 'mark', text: 'TSX', label: 'TypeScript JSX' });
  });

  test('gives video and audio their own shapes, not the generic document', () => {
    expect(fileTypeFor('demo.mp4')).toMatchObject({ glyph: 'film', label: 'Video' });
    expect(fileTypeFor('theme.MP3')).toMatchObject({ glyph: 'wave', label: 'Audio' });
  });

  test('languages that would share a shape are told apart by more than hue', () => {
    // The whole point: at 15px a colour change alone does not separate these.
    const ts = fileTypeFor('a.ts');
    const js = fileTypeFor('a.js');

    expect(ts.color).not.toBe(js.color);
    expect(ts.text).toBe('TS');
    expect(js.text).toBe('JS');
    expect(ts.text).not.toBe(js.text);
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
