import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewPane } from './PreviewPane';

const FILES = [{ path: 'main.js', content: 'console.log("hi")' }];

function post(data: Record<string, unknown>) {
  const frame = screen.getByTestId('preview-frame') as HTMLIFrameElement;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: '__space_preview__', ...data },
    }));
  });
}

function emit(level: string, text: string) {
  post({ type: 'console', level, text });
}

describe('PreviewPane', () => {
  test('runs in a frame that cannot reach this origin', () => {
    // allow-scripts WITHOUT allow-same-origin is the whole boundary; the two
    // together would let the frame strip its own sandbox attribute.
    render(<PreviewPane files={FILES} entry="main.js" />);
    expect(screen.getByTestId('preview-frame')).toHaveAttribute('sandbox', 'allow-scripts');
  });

  test('inlines the workspace into the frame document', async () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    // Carried as a JSON island, so the source arrives escaped. Built after an
    // await now, since a TypeScript workspace is compiled first.
    await waitFor(() => {
      expect(screen.getByTestId('preview-frame').getAttribute('srcdoc'))
        .toContain(String.raw`console.log(\"hi\")`);
    });
  });

  test('shows console output the frame sends back', () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    emit('log', 'hello from the sandbox');
    expect(screen.getByTestId('preview-console')).toHaveTextContent('hello from the sandbox');
  });

  test('counts errors separately', () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    emit('error', 'ReferenceError: x is not defined');
    expect(screen.getByTestId('preview-error-count')).toHaveTextContent('1 error');
  });

  test('ignores messages that did not come from its own frame', () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: { channel: '__space_preview__', type: 'console', level: 'log', text: 'spoofed' },
      }));
    });
    expect(screen.getByTestId('preview-console')).not.toHaveTextContent('spoofed');
  });

  test('clears output on request', async () => {
    const user = userEvent.setup();
    render(<PreviewPane files={FILES} entry="main.js" />);
    emit('log', 'noise');

    await user.click(screen.getByLabelText('Clear console'));

    expect(screen.getByTestId('preview-console')).not.toHaveTextContent('noise');
  });

  test('explains itself instead of rendering a frame for a file it cannot run', () => {
    render(<PreviewPane files={[{ path: 'a.css', content: '' }]} entry="a.css" />);
    expect(screen.getByTestId('preview-blocked')).toHaveTextContent(/stylesheet/i);
    expect(screen.queryByTestId('preview-frame')).not.toBeInTheDocument();
  });

  test('compiles a TypeScript entry and strips its types', async () => {
    render(
      <PreviewPane
        files={[{ path: 'main.ts', content: 'const n: number = 1; console.log(n);' }]}
        entry="main.ts"
      />,
    );

    await waitFor(() => {
      const srcdoc = screen.getByTestId('preview-frame').getAttribute('srcdoc') ?? '';
      expect(srcdoc).toContain('console.log(n)');
      expect(srcdoc).not.toContain(': number');
    });
  });

  test('reports a TypeScript syntax error in the console instead of a blank frame', async () => {
    render(
      <PreviewPane
        files={[{ path: 'main.ts', content: 'const = : oops' }]}
        entry="main.ts"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-console')).toHaveTextContent(/main\.ts/);
    });
  });

  test('re-running starts from a clean console', async () => {
    const user = userEvent.setup();
    render(<PreviewPane files={FILES} entry="main.js" />);
    emit('log', 'from the first run');

    await user.click(screen.getByLabelText('Re-run preview'));

    expect(screen.getByTestId('preview-console')).not.toHaveTextContent('from the first run');
  });
});

describe('PreviewPane run outcome', () => {
  test('says so when code ran but rendered nothing, pointing at the console', async () => {
    // The usual "I hit run and nothing happened": a script that only logs.
    render(<PreviewPane files={FILES} entry="main.js" />);
    // Wait for the document to actually be built: the frame cannot post
    // anything before it has one, and a message arriving earlier is discarded
    // when the fresh document resets the run state.
    await waitFor(() => {
      expect(screen.getByTestId('preview-frame').getAttribute('srcdoc')).toBeTruthy();
    });

    emit('log', 'oraz');
    post({ type: 'ready', drew: false });

    await waitFor(() => {
      expect(screen.getByTestId('preview-silent')).toHaveTextContent(/rendering anything/i);
    });
    expect(screen.getByTestId('preview-silent')).toHaveTextContent(/Console below/i);
  });

  test('stays out of the way when the run drew something', async () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    // Wait for the document to actually be built: the frame cannot post
    // anything before it has one, and a message arriving earlier is discarded
    // when the fresh document resets the run state.
    await waitFor(() => {
      expect(screen.getByTestId('preview-frame').getAttribute('srcdoc')).toBeTruthy();
    });

    post({ type: 'ready', drew: true });

    await waitFor(() => {
      expect(screen.queryByTestId('preview-silent')).not.toBeInTheDocument();
    });
  });

  test('shows a failure banner, not just a console line', async () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    // Wait for the document to actually be built: the frame cannot post
    // anything before it has one, and a message arriving earlier is discarded
    // when the fresh document resets the run state.
    await waitFor(() => {
      expect(screen.getByTestId('preview-frame').getAttribute('srcdoc')).toBeTruthy();
    });

    post({ type: 'failed', text: 'ReferenceError: nope is not defined' });

    await waitFor(() => {
      expect(screen.getByTestId('preview-failure')).toHaveTextContent(/ReferenceError/);
    });
  });

  test('a failure takes precedence over the silent hint', async () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    // Wait for the document to actually be built: the frame cannot post
    // anything before it has one, and a message arriving earlier is discarded
    // when the fresh document resets the run state.
    await waitFor(() => {
      expect(screen.getByTestId('preview-frame').getAttribute('srcdoc')).toBeTruthy();
    });

    post({ type: 'failed', text: 'boom' });
    post({ type: 'ready', drew: false });

    await waitFor(() => expect(screen.getByTestId('preview-failure')).toBeInTheDocument());
    expect(screen.queryByTestId('preview-silent')).not.toBeInTheDocument();
  });

  describe('loading the project', () => {
    test('shows a loading state instead of the previous run', () => {
      render(<PreviewPane files={FILES} entry="main.js" loading />);

      expect(screen.getByTestId('preview-loading')).toHaveTextContent('Loading project…');
      expect(screen.getByRole('status')).toHaveTextContent('Loading project…');
      expect(screen.queryByTestId('preview-frame')).not.toBeInTheDocument();
    });

    test('announces the load through a live region that was already there, never marked busy', () => {
      const { rerender } = render(<PreviewPane files={FILES} entry="main.js" />);
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('');

      rerender(<PreviewPane files={FILES} entry="main.js" loading />);

      // The same element, with its text swapped in: that change is what is announced.
      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent('Loading project…');
      expect(status).not.toHaveAttribute('aria-busy');
      expect(screen.getByTestId('preview-loading')).toHaveAttribute('aria-hidden', 'true');

      rerender(<PreviewPane files={FILES} entry="main.js" />);
      expect(status).toHaveTextContent('');
    });

    test('shows a load failure, and offers to try again', async () => {
      const user = userEvent.setup();
      const onRerun = vi.fn();
      render(
        <PreviewPane files={[]} entry="main.js" loadError="Could not load the project: offline" onRerun={onRerun} />,
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Could not load the project: offline');
      expect(screen.queryByTestId('preview-frame')).not.toBeInTheDocument();
      expect(screen.getByTestId('preview-error-count')).toHaveTextContent('1 error');

      // Its name begins with what it shows, so voice control can reach it by that.
      const retry = screen.getByRole('button', { name: /^Try again/ });
      expect(retry).toHaveTextContent('Try again');
      await user.click(retry);
      expect(onRerun).toHaveBeenCalled();
    });

    test('puts load notices in the console as warnings, and opens it', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<PreviewPane files={FILES} entry="main.js" />);
      // Collapsed by the user before the next run reported anything.
      await user.click(screen.getByRole('button', { name: /^console/i, expanded: true }));
      expect(screen.queryByTestId('preview-console')).not.toBeInTheDocument();

      rerender(
        <PreviewPane
          files={FILES}
          entry="main.js"
          notices={['This project has more than 300 files, so only the first 300 were loaded.']}
        />,
      );

      const notices = screen.getAllByTestId('preview-notice');
      expect(notices).toHaveLength(1);
      expect(notices[0]).toHaveTextContent(/more than 300 files/);
    });

    test('keeps notices through a console clear, like compile errors', async () => {
      const user = userEvent.setup();
      render(<PreviewPane files={FILES} entry="main.js" notices={['Skipped lib/']} />);

      await user.click(screen.getByLabelText('Clear console'));

      expect(screen.getByTestId('preview-notice')).toHaveTextContent('Skipped lib/');
    });

    test('shows a nested entry by its full path', () => {
      render(<PreviewPane files={[{ path: 'src/main.js', content: '' }]} entry="src/main.js" />);
      expect(screen.getByTitle('src/main.js')).toBeInTheDocument();
    });
  });
});

describe('PreviewPane running the whole project', () => {
  const PROJECT = [
    { path: 'index.html', content: '<div id="root"></div><script type="module" src="/src/main.tsx"></script>' },
    { path: 'src/main.tsx', content: "import './components/Button';" },
    { path: 'src/components/Button.tsx', content: 'export const Button = 1;' },
    { path: 'src/about.html', content: '<h1>about</h1>' },
  ];

  afterEach(() => {
    window.sessionStorage.clear();
  });

  const srcdoc = () => screen.getByTestId('preview-frame').getAttribute('srcdoc') ?? '';

  test('starts from the project entry, and says so in the header', async () => {
    render(<PreviewPane files={PROJECT} entry="src/components/Button.tsx" />);

    expect(screen.getByTestId('preview-entry')).toHaveTextContent('index.html');
    await waitFor(() => expect(srcdoc()).toContain('data-entry="src/main.js"'));
    expect(screen.getByTestId('preview-scope-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  test('can run the open file instead, and remembers that for the session', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PreviewPane files={PROJECT} entry="src/components/Button.tsx" />);

    const toggle = screen.getByRole('button', { name: /^This file: run only src\/components\/Button\.tsx/ });
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('preview-entry')).toHaveTextContent('src/components/Button.tsx');
    await waitFor(() => expect(srcdoc()).toContain('data-entry="src/components/Button.js"'));

    // Closing and reopening the pane keeps the choice.
    unmount();
    render(<PreviewPane files={PROJECT} entry="src/components/Button.tsx" />);
    expect(screen.getByTestId('preview-entry')).toHaveTextContent('src/components/Button.tsx');
    expect(screen.getByTestId('preview-scope-toggle')).toHaveAttribute('aria-pressed', 'true');

    // And pressing it again goes back to the project.
    await user.click(screen.getByTestId('preview-scope-toggle'));
    expect(screen.getByTestId('preview-entry')).toHaveTextContent('index.html');
  });

  test('an open html file always runs itself, with nothing to toggle', () => {
    render(<PreviewPane files={PROJECT} entry="src/about.html" />);

    expect(screen.getByTestId('preview-entry')).toHaveTextContent('src/about.html');
    expect(screen.queryByTestId('preview-scope-toggle')).not.toBeInTheDocument();
  });

  test('a project with no entry runs the open file, as before', () => {
    render(<PreviewPane files={[{ path: 'lib/util.js', content: '' }]} entry="lib/util.js" />);

    expect(screen.getByTestId('preview-entry')).toHaveTextContent('lib/util.js');
    expect(screen.queryByTestId('preview-scope-toggle')).not.toBeInTheDocument();
  });

  test('the entry file itself has nothing to toggle', () => {
    render(<PreviewPane files={PROJECT.filter((file) => file.path !== 'index.html')} entry="src/main.tsx" />);
    expect(screen.queryByTestId('preview-scope-toggle')).not.toBeInTheDocument();
  });
});
