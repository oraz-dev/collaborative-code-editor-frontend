import {
  IMPORT_META_ENV_BINDING, mapCode, shimImportMeta, VITE_ENV, VITE_ENV_GLOBAL,
} from './viteShim';

// Spelled in pieces so this file's own `import.meta` is never what is tested.
const META = ['import', 'meta'].join('.');

describe('shimImportMeta', () => {
  const COPY = `const ${IMPORT_META_ENV_BINDING} = Object.assign({}, globalThis.${VITE_ENV_GLOBAL}); `;

  test('points import.meta.env at a per-module copy of the loader global', () => {
    expect(shimImportMeta(`const dev = ${META}.env.DEV;`))
      .toBe(`${COPY}const dev = ${IMPORT_META_ENV_BINDING}.DEV;`);
  });

  test('handles destructuring and every mention in a file', () => {
    const source = `const { MODE } = ${META}.env;\nif (${META}.env.PROD) {}`;
    const output = shimImportMeta(source);
    expect(output).not.toContain(`${META}.env`);
    expect(output.match(new RegExp(`${IMPORT_META_ENV_BINDING}\\.|${IMPORT_META_ENV_BINDING};`, 'g'))).toHaveLength(2);
  });

  test('accepts whitespace around the dots', () => {
    expect(shimImportMeta('import . meta\n  .env.MODE')).toBe(`${COPY}${IMPORT_META_ENV_BINDING}.MODE`);
  });

  test('turns import.meta.hot into undefined, so guards skip it', () => {
    expect(shimImportMeta(`if (${META}.hot) ${META}.hot.accept();`))
      .toBe('if (undefined) undefined.accept();');
    expect(shimImportMeta(`${META}.hot?.dispose(() => {});`)).toBe('undefined?.dispose(() => {});');
  });

  test('leaves the parts of import.meta a browser does provide', () => {
    const source = `new URL('./a.png', ${META}.url); ${META}.resolve('x'); ${META}.environment;`;
    expect(shimImportMeta(source)).toBe(source);
  });

  test('leaves code with no import.meta untouched', () => {
    const source = 'const env = process.env; const meta = {};';
    expect(shimImportMeta(source)).toBe(source);
  });

  test('the rewritten code reads the values vite dev reports', () => {
    const run = new Function(`${VITE_ENV_GLOBAL}`, `var globalThis = { ${VITE_ENV_GLOBAL}: ${VITE_ENV_GLOBAL} };\n`
      + shimImportMeta(`return [${META}.env.MODE, ${META}.env.DEV, ${META}.env.PROD, ${META}.env.SSR, ${META}.env.BASE_URL, ${META}.env.VITE_MISSING];`));
    expect(run(VITE_ENV)).toEqual(['development', true, false, false, '/', undefined]);
  });

  test('the shared env object cannot be changed by previewed code', () => {
    expect(Object.isFrozen(VITE_ENV)).toBe(true);
  });

  test('a module may add to its own env, as it can under Vite', () => {
    const run = new Function(`${VITE_ENV_GLOBAL}`, `'use strict'; var globalThis = { ${VITE_ENV_GLOBAL}: ${VITE_ENV_GLOBAL} };\n`
      + `${shimImportMeta(`${META}.env.FOO = 'bar';`)}\nreturn ${IMPORT_META_ENV_BINDING}.FOO;`);
    expect(run(VITE_ENV)).toBe('bar');
    expect(VITE_ENV).not.toHaveProperty('FOO');
  });

  test('leaves strings, template text, comments and regexes alone', () => {
    const source = [
      `const a = '${META}.env.VITE_KEY';`,
      `const b = "Set ${META}.env.VITE_KEY";`,
      `const c = \`see ${META}.env: \${${META}.env.MODE}\`;`,
      `// ${META}.env in a comment`,
      `/* ${META}.env */ const d = /${META}.env/;`,
    ].join('\n');

    const output = shimImportMeta(source);

    expect(output).toContain(`'${META}.env.VITE_KEY'`);
    expect(output).toContain(`"Set ${META}.env.VITE_KEY"`);
    // Only the expression inside the template is code.
    expect(output).toContain(`\`see ${META}.env: \${${IMPORT_META_ENV_BINDING}.MODE}\``);
    expect(output).toContain(`// ${META}.env in a comment`);
    expect(output).toContain(`/* ${META}.env */ const d = /${META}.env/;`);
  });

  test('JSX text, once compiled to a string, is left as written', () => {
    // What sucrase makes of <code>import.meta.env.VITE_URL</code>.
    const compiled = `const x = _jsx("code", { children: "${META}.env.VITE_URL" });`;
    expect(shimImportMeta(compiled)).toBe(compiled);
  });
});

describe('mapCode', () => {
  test('tells division from a regular expression', () => {
    const seen: string[] = [];
    mapCode("const r = a / b / c; const s = x.replace(/'/g, '');", (code) => {
      seen.push(code);
      return code;
    });
    // The quote inside the regex must not open a string that swallows the rest.
    expect(seen.join('|')).toContain('.replace(');
    expect(seen.join('|')).toContain('a / b / c');
  });

  test('round-trips any source unchanged under the identity transform', () => {
    const source = "a = `x${ {b: 1}.b }y` + '}' /* } */ + /[/]/.source; // `";
    expect(mapCode(source, (code) => code)).toBe(source);
  });
});
