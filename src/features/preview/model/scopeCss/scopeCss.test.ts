import { describe, expect, test } from 'vitest';
import { camelCase, hashPath, scopeCss } from './scopeCss';

const PATH = 'src/components/Card.module.css';
const H = hashPath(PATH);

describe('hashPath', () => {
  test('is stable for a path', () => {
    expect(hashPath(PATH)).toBe(hashPath(PATH));
  });

  test('differs between paths', () => {
    expect(hashPath('a/Card.module.css')).not.toBe(hashPath('b/Card.module.css'));
  });

  test('is short and safe inside a class name', () => {
    expect(hashPath(PATH)).toMatch(/^[0-9a-z]{1,7}$/);
  });
});

describe('camelCase', () => {
  test('joins kebab-case', () => {
    expect(camelCase('card-title')).toBe('cardTitle');
    expect(camelCase('is-very-big')).toBe('isVeryBig');
  });

  test('leaves other names alone', () => {
    expect(camelCase('card')).toBe('card');
    expect(camelCase('card_title')).toBe('card_title');
  });
});

describe('scopeCss', () => {
  test('renames a class selector and maps it', () => {
    const { css, classes } = scopeCss('.card { color: red; }', PATH);

    expect(css).toBe(`.card_${H} { color: red; }`);
    expect(classes).toEqual({ card: `card_${H}` });
  });

  test('renames every class in a compound and complex selector list', () => {
    const { css } = scopeCss('.a.b:hover > .c, div.d ~ .e::before {}', PATH);

    expect(css).toBe(`.a_${H}.b_${H}:hover > .c_${H}, div.d_${H} ~ .e_${H}::before {}`);
  });

  test('adds camelCase keys for kebab-case names, keeping the original', () => {
    const { classes } = scopeCss('.card-title {}', PATH);

    expect(classes['card-title']).toBe(`card-title_${H}`);
    expect(classes.cardTitle).toBe(`card-title_${H}`);
  });

  test('a real class wins over a camelCase alias of the same spelling', () => {
    const { classes } = scopeCss('.card-title {} .cardTitle {}', PATH);

    expect(classes.cardTitle).toBe(`cardTitle_${H}`);
  });

  test('never touches declaration values', () => {
    const source = '.a { margin: 0.5em .25em; background: url(./img.v2.png); content: ".x"; }';
    const { css } = scopeCss(source, PATH);

    expect(css).toBe(`.a_${H} { margin: 0.5em .25em; background: url(./img.v2.png); content: ".x"; }`);
  });

  test('a url with a semicolon in it does not end the declaration early', () => {
    const source = '.a { background: url(data:image/png;base64,AA.bb); } .b {}';
    const { css } = scopeCss(source, PATH);

    expect(css).toContain('url(data:image/png;base64,AA.bb)');
    expect(css).toContain(`.b_${H} {}`);
  });

  test('scopes rules inside @media, but not the media query itself', () => {
    const source = '@media (min-width: 40.5em) { .a { color: red; } }';
    const { css } = scopeCss(source, PATH);

    expect(css).toBe(`@media (min-width: 40.5em) { .a_${H} { color: red; } }`);
  });

  test('scopes rules inside nested grouping rules', () => {
    const source = '@supports (display: grid) { @media screen { .grid { display: grid; } } }';

    expect(scopeCss(source, PATH).css).toContain(`.grid_${H} {`);
  });

  test('scopes nested style rules', () => {
    const source = '.card { color: red; & .title { color: blue; } .icon { width: 1.5em; } }';
    const { css, classes } = scopeCss(source, PATH);

    expect(css).toBe(
      `.card_${H} { color: red; & .title_${H} { color: blue; } .icon_${H} { width: 1.5em; } }`,
    );
    expect(Object.keys(classes).sort()).toEqual(['card', 'icon', 'title']);
  });

  test('leaves keyframe selectors alone', () => {
    const source = '@keyframes spin { from { opacity: 0; } 12.5% { opacity: .5; } to {} } .a {}';
    const { css } = scopeCss(source, PATH);

    expect(css).toBe(
      `@keyframes spin { from { opacity: 0; } 12.5% { opacity: .5; } to {} } .a_${H} {}`,
    );
  });

  test('leaves @font-face descriptors alone', () => {
    const source = '@font-face { font-family: x; src: url(./a.woff2); } .a {}';

    expect(scopeCss(source, PATH).css).toBe(
      `@font-face { font-family: x; src: url(./a.woff2); } .a_${H} {}`,
    );
  });

  test('ignores dots in attribute selectors, strings and comments', () => {
    const source = '/* .note */ a[href$=".pdf"] .link {}';
    const { css, classes } = scopeCss(source, PATH);

    expect(css).toBe(`/* .note */ a[href$=".pdf"] .link_${H} {}`);
    expect(classes).toEqual({ link: `link_${H}` });
  });

  test('ignores a brace inside a string', () => {
    const source = '.a { content: "}"; } .b {}';

    expect(scopeCss(source, PATH).css).toBe(`.a_${H} { content: "}"; } .b_${H} {}`);
  });

  test('scopes classes inside functional pseudo-classes', () => {
    expect(scopeCss('.a:not(.b) {}', PATH).css).toBe(`.a_${H}:not(.b_${H}) {}`);
  });

  test(':global(...) keeps its contents as written and drops the wrapper', () => {
    const { css, classes } = scopeCss(':global(.dark) .a {}', PATH);

    expect(css).toBe(`.dark .a_${H} {}`);
    expect(classes).not.toHaveProperty('dark');
  });

  test('element and id selectors are untouched', () => {
    expect(scopeCss('body #app h1 {}', PATH).css).toBe('body #app h1 {}');
  });

  test('a class used twice maps once', () => {
    const { classes } = scopeCss('.a {} .a:hover {}', PATH);

    expect(classes).toEqual({ a: `a_${H}` });
  });

  test('different files give the same class different names', () => {
    const first = scopeCss('.title {}', 'a/One.module.css').classes.title;
    const second = scopeCss('.title {}', 'b/Two.module.css').classes.title;

    expect(first).not.toBe(second);
  });

  test('survives an unclosed block without throwing', () => {
    expect(() => scopeCss('.a { color: red;', PATH)).not.toThrow();
    expect(scopeCss('.a { color: red;', PATH).css).toBe(`.a_${H} { color: red;`);
  });
});

describe('scopeCss — bare :global and :local', () => {
  const path = 'a.module.css';
  const h = hashPath(path);

  test('bare :global leaves the rest of the selector unscoped, and is removed', () => {
    const { css, classes } = scopeCss(':global .dark .a { color: red }', path);
    expect(css).toBe('.dark .a { color: red }');
    expect(classes).toEqual({});
  });

  test('bare :global mid-selector keeps what came before it scoped', () => {
    expect(scopeCss('.a :global .b { }', path).css).toBe(`.a_${h} .b { }`);
  });

  test('bare :global ends at a comma, and :local switches back', () => {
    expect(scopeCss(':global .x, .y { }', path).css).toBe(`.x, .y_${h} { }`);
    expect(scopeCss(':global .x :local .y { }', path).css).toBe(`.x .y_${h} { }`);
  });

  test(':local(...) scopes its contents and drops the wrapper', () => {
    const { css, classes } = scopeCss(':local(.a) { color: red }', path);
    expect(css).toBe(`.a_${h} { color: red }`);
    expect(classes.a).toBe(`a_${h}`);
  });

  test(':global inside a name is not the keyword', () => {
    expect(scopeCss('.x:globalish { }', path).css).toBe(`.x_${h}:globalish { }`);
  });
});
