import { lookupIn, resolveCssReferences } from './cssReferences';

const file = (path: string, content = '') => ({ path, content });

describe('resolveCssReferences', () => {
  test('inlines a relative @import in place, so its variables apply', () => {
    const files = [
      file('src/index.css', "@import './vars.css';\nbody { color: var(--c); }"),
      file('src/vars.css', ':root { --c: red; }'),
    ];

    const { css, warnings } = resolveCssReferences(files[0].content, 'src/index.css', lookupIn(files));

    expect(css).toContain(':root { --c: red; }');
    expect(css).not.toContain('@import');
    expect(css.indexOf('--c: red')).toBeLessThan(css.indexOf('body'));
    expect(warnings).toEqual([]);
  });

  test('resolves nested imports against each file, once per chain, with media kept', () => {
    const files = [
      file('a.css', '@import url("styles/b.css") screen;'),
      file('styles/b.css', "@import './c.css'; .b {}"),
      file('styles/c.css', "@import '../a.css'; .c {}"),
    ];

    const { css } = resolveCssReferences(files[0].content, 'a.css', lookupIn(files));

    expect(css).toMatch(/@media screen \{[\s\S]*\.c \{\}[\s\S]*\.b \{\}[\s\S]*\}/);
    expect(css).not.toContain('@import');
  });

  test('hoists an external @import above inlined rules', () => {
    const files = [
      file('a.css', "@import './b.css';\n@import url(https://fonts.example/x.css);"),
      file('b.css', '.b { color: red }'),
    ];

    const { css } = resolveCssReferences(files[0].content, 'a.css', lookupIn(files));

    expect(css.trim().startsWith('@import url(https://fonts.example/x.css);')).toBe(true);
  });

  test('turns a workspace SVG url() into a data: URL, from public/ for a root path', () => {
    const files = [
      file('src/a.css', 'body { background: url(./bg.svg) } h1 { background: url("/logo.svg") }'),
      file('src/bg.svg', '<svg id="bg"/>'),
      file('public/logo.svg', '<svg id="logo"/>'),
    ];

    const { css, warnings } = resolveCssReferences(files[0].content, 'src/a.css', lookupIn(files));

    expect(css).toContain(`url("data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg id="bg"/>')}")`);
    expect(css).toContain(encodeURIComponent('<svg id="logo"/>'));
    expect(warnings).toEqual([]);
  });

  test('reports what cannot load, and leaves external and data URLs alone', () => {
    const source = 'a { background: url(./photo.png) } b { background: url(data:x) } c { background: url(https://x/y.png) }';
    const { css, warnings } = resolveCssReferences(source, 'a.css', lookupIn([file('photo.png', 'binary')]));

    expect(css).toBe(source);
    expect(warnings).toEqual([expect.stringContaining('url(./photo.png) cannot load')]);
  });

  test('warns about an @import of a missing stylesheet', () => {
    const { warnings } = resolveCssReferences("@import './nope.css';", 'a.css', lookupIn([]));
    expect(warnings).toEqual([expect.stringContaining('@import "./nope.css"')]);
  });
});
