import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { IDLE_RUN_STATE, type RunResult, type RunState } from '@/features/collaboration';
import { RunOutputPane } from './RunOutputPane';

const PYTHON = { id: 71, name: 'Python (3.8.1)' };

const RESULT: RunResult = {
  stdout: 'hello\n',
  stderr: '',
  compile_output: '',
  message: '',
  status_id: 3,
  status: 'Accepted',
  time: '0.012',
  memory: 3200,
};

function renderPane(runState: RunState, over: Partial<Parameters<typeof RunOutputPane>[0]> = {}) {
  const onRerun = vi.fn();
  const onClose = vi.fn();

  render(
    <RunOutputPane
      runState={runState}
      language={PYTHON}
      fileName="main.py"
      canRerun
      onRerun={onRerun}
      onClose={onClose}
      {...over}
    />,
  );

  return { onRerun, onClose };
}

const running: RunState = { ...IDLE_RUN_STATE, phase: 'running', languageId: 71 };
const done: RunState = { ...IDLE_RUN_STATE, phase: 'done', result: RESULT };

describe('RunOutputPane while running', () => {
  test('says what is running, politely announced', () => {
    renderPane(running);

    const pending = screen.getByTestId('run-pending');
    expect(pending).toHaveAttribute('aria-live', 'polite');
    expect(pending).toHaveTextContent('Python (3.8.1)');
  });

  test('names the collaborator whose run this is', () => {
    // A run is broadcast to the room, so the pane may be showing somebody
    // else's execution.
    renderPane(running, { requestedByName: 'Ada' });
    expect(screen.getByTestId('run-pending')).toHaveTextContent('Started by Ada');
  });

  test('cannot be re-run while it is still going', () => {
    renderPane(running);
    expect(screen.getByLabelText('Run main.py again')).toBeDisabled();
  });
});

describe('RunOutputPane with a result', () => {
  test('shows the verdict, the timings and the output', () => {
    renderPane(done);

    expect(screen.getByTestId('run-outcome')).toHaveTextContent('Finished');
    expect(screen.getByTestId('run-verdict')).toHaveTextContent('12 ms');
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('a crash is a finished run, shown as one', () => {
    renderPane({
      ...done,
      result: { ...RESULT, status_id: 11, status: 'Runtime Error (NZEC)', stdout: '', stderr: 'boom' },
    });

    expect(screen.getByTestId('run-outcome')).toHaveTextContent('Crashed');
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  test('a compile error leads with the compiler, not with stale stdout', () => {
    renderPane({
      ...done,
      result: {
        ...RESULT,
        status_id: 6,
        status: 'Compilation Error',
        compile_output: 'main.c:1: expected ;',
        stdout: '',
      },
    });

    expect(screen.getByTestId('run-outcome')).toHaveTextContent('Did not compile');
    expect(screen.getByText('Compiler')).toBeInTheDocument();
  });

  test('explains a run that printed nothing', () => {
    renderPane({ ...done, result: { ...RESULT, stdout: '' } });
    expect(screen.getByTestId('run-silent')).toBeInTheDocument();
  });
});

describe('RunOutputPane when the run was refused', () => {
  test('shows the reason as an alert', () => {
    renderPane({
      ...IDLE_RUN_STATE,
      phase: 'failed',
      failure: { code: 'forbidden', message: 'Only the document’s owner can run it.' },
    });

    expect(screen.getByTestId('run-failure')).toHaveTextContent('owner');
    expect(screen.getByTestId('run-failure')).toHaveAttribute('role', 'alert');
  });

  test('offers a retry for a transient failure but not for a permanent one', () => {
    const transient: RunState = {
      ...IDLE_RUN_STATE,
      phase: 'failed',
      failure: { code: 'run_failed', message: 'The sandbox could not be reached.' },
    };
    const { unmount } = render(
      <RunOutputPane
        runState={transient}
        language={PYTHON}
        fileName="main.py"
        canRerun
        onRerun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    unmount();

    // Retrying a permission error would only fail the same way.
    renderPane({
      ...IDLE_RUN_STATE,
      phase: 'failed',
      failure: { code: 'forbidden', message: 'Only the document’s owner can run it.' },
    });
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('RunOutputPane controls', () => {
  test('a collaborator gets no re-run button, since the server would refuse it', () => {
    renderPane(done, { canRerun: false });

    expect(screen.queryByLabelText('Run main.py again')).not.toBeInTheDocument();
    // They can still dismiss the pane.
    expect(screen.getByLabelText('Close output')).toBeInTheDocument();
  });

  test('closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPane(done);

    await user.click(screen.getByLabelText('Close output'));
    expect(onClose).toHaveBeenCalled();
  });

  test('re-runs', async () => {
    const user = userEvent.setup();
    const { onRerun } = renderPane(done);

    await user.click(screen.getByLabelText('Run main.py again'));
    expect(onRerun).toHaveBeenCalled();
  });
});
