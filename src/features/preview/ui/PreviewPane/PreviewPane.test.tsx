import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewPane } from './PreviewPane';

const FILES = [{ path: 'main.js', content: 'console.log("hi")' }];

function emit(level: string, text: string) {
  const frame = screen.getByTestId('preview-frame') as HTMLIFrameElement;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { channel: '__space_preview__', type: 'console', level, text },
    }));
  });
}

describe('PreviewPane', () => {
  test('runs in a frame that cannot reach this origin', () => {
    // allow-scripts WITHOUT allow-same-origin is the whole boundary; the two
    // together would let the frame strip its own sandbox attribute.
    render(<PreviewPane files={FILES} entry="main.js" />);
    expect(screen.getByTestId('preview-frame')).toHaveAttribute('sandbox', 'allow-scripts');
  });

  test('inlines the workspace into the frame document', () => {
    render(<PreviewPane files={FILES} entry="main.js" />);
    // Carried as a JSON island, so the source arrives escaped.
    expect(screen.getByTestId('preview-frame').getAttribute('srcdoc'))
      .toContain(String.raw`console.log(\"hi\")`);
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
    render(<PreviewPane files={[{ path: 'a.ts', content: '' }]} entry="a.ts" />);
    expect(screen.getByTestId('preview-blocked')).toHaveTextContent(/compile step/i);
    expect(screen.queryByTestId('preview-frame')).not.toBeInTheDocument();
  });

  test('re-running starts from a clean console', async () => {
    const user = userEvent.setup();
    render(<PreviewPane files={FILES} entry="main.js" />);
    emit('log', 'from the first run');

    await user.click(screen.getByLabelText('Re-run preview'));

    expect(screen.getByTestId('preview-console')).not.toHaveTextContent('from the first run');
  });
});
