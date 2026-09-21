import { chooseRunEntry, detectProjectEntry, ENTRY_CANDIDATES } from './projectEntry';

const file = (path: string, content = '') => ({ path, content });

describe('detectProjectEntry', () => {
  test('a Vite index.html comes first', () => {
    expect(detectProjectEntry([
      file('src/main.tsx'),
      file('index.html', '<script type="module" src="/src/main.tsx"></script>'),
    ])).toBe('index.html');
  });

  test('a static index.html does not count', () => {
    expect(detectProjectEntry([file('index.html', '<h1>hi</h1>'), file('src/main.tsx')]))
      .toBe('src/main.tsx');
  });

  test('only the root index.html is considered', () => {
    expect(detectProjectEntry([
      file('docs/index.html', '<script type="module" src="./a.js"></script>'),
      file('App.jsx'),
    ])).toBe('App.jsx');
  });

  test('candidates are tried in order', () => {
    // Every candidate present: each must lose only to those listed before it.
    for (let index = 0; index < ENTRY_CANDIDATES.length; index += 1) {
      const files = ENTRY_CANDIDATES.slice(index).reverse().map((path) => file(path));
      expect(detectProjectEntry(files)).toBe(ENTRY_CANDIDATES[index]);
    }
  });

  test('main wins over App', () => {
    expect(detectProjectEntry([file('src/App.tsx'), file('main.js')])).toBe('main.js');
  });

  test('a module script from a CDN does not make index.html the entry', () => {
    expect(detectProjectEntry([
      file('index.html', '<script type="module" src="https://cdn.x/y.js"></script>'),
      file('src/main.tsx'),
    ])).toBe('src/main.tsx');
  });

  test('a module script naming a missing file does not either', () => {
    expect(detectProjectEntry([
      file('index.html', '<script type="module" src="/src/gone.tsx"></script>'),
      file('src/App.tsx'),
    ])).toBe('src/App.tsx');
  });

  test('a Create React App src/index.tsx comes before App', () => {
    expect(detectProjectEntry([
      file('public/index.html', '<div id="root"></div>'),
      file('src/App.tsx'),
      file('src/index.tsx', "import './index.css';"),
    ])).toBe('src/index.tsx');
  });

  test('a plain index.html is the entry when there is no script candidate', () => {
    expect(detectProjectEntry([
      file('index.html', '<script src="app.js"></script>'),
      file('app.js'),
      file('style.css'),
    ])).toBe('index.html');
  });

  test('a plain index.html still loses to any script candidate', () => {
    for (const candidate of ENTRY_CANDIDATES) {
      expect(detectProjectEntry([file('index.html', '<h1>hi</h1>'), file(candidate)])).toBe(candidate);
    }
  });

  test('none -> no project entry', () => {
    expect(detectProjectEntry([file('src/util.ts'), file('lib/main.ts'), file('app.tsx')])).toBeNull();
    expect(detectProjectEntry([])).toBeNull();
  });
});

describe('chooseRunEntry', () => {
  test('runs the project entry by default', () => {
    expect(chooseRunEntry({ openFile: 'src/util.ts', projectEntry: 'src/main.tsx', scope: 'project' }))
      .toEqual({ entry: 'src/main.tsx', runsProject: true, canChoose: true });
  });

  test('runs the open file when asked to', () => {
    expect(chooseRunEntry({ openFile: 'src/util.ts', projectEntry: 'src/main.tsx', scope: 'file' }))
      .toEqual({ entry: 'src/util.ts', runsProject: false, canChoose: true });
  });

  test('an html file always runs itself', () => {
    expect(chooseRunEntry({ openFile: 'about.html', projectEntry: 'index.html', scope: 'project' }))
      .toEqual({ entry: 'about.html', runsProject: false, canChoose: false });
  });

  test('no project entry means the open file, with nothing to choose', () => {
    expect(chooseRunEntry({ openFile: 'a.js', projectEntry: null, scope: 'project' }))
      .toEqual({ entry: 'a.js', runsProject: false, canChoose: false });
  });

  test('the open file being the entry leaves nothing to choose', () => {
    expect(chooseRunEntry({ openFile: 'src/main.tsx', projectEntry: 'src/main.tsx', scope: 'project' }))
      .toEqual({ entry: 'src/main.tsx', runsProject: false, canChoose: false });
  });
});
