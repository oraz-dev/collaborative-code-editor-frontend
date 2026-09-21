import { describe, expect, test } from 'vitest';
import {
  IDLE_RUN_STATE,
  beginLocalRun,
  localRunFailure,
  reduceRunState,
  type RunState,
} from './runState';
import type { RunResult } from '../types/controlFrames';

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

const started = (by = 'user-1', languageId = 71) => ({
  type: 'run:started' as const,
  requested_by: by,
  language_id: languageId,
});

describe('reduceRunState', () => {
  test('a started run clears whatever the last one left behind', () => {
    const previous: RunState = {
      phase: 'done',
      sequence: 1,
      requestedBy: 'user-1',
      languageId: 71,
      result: RESULT,
      failure: null,
    };

    expect(reduceRunState(previous, started())).toEqual({
      phase: 'running',
      sequence: 2,
      requestedBy: 'user-1',
      languageId: 71,
      result: null,
      failure: null,
    });
  });

  test('a result ends the run', () => {
    const running = reduceRunState(IDLE_RUN_STATE, started());
    const done = reduceRunState(running, {
      type: 'run:result',
      requested_by: 'user-1',
      result: RESULT,
    });

    expect(done.phase).toBe('done');
    expect(done.result).toEqual(RESULT);
  });

  test("tracks a run somebody else started - the room watches one execution", () => {
    const state = reduceRunState(IDLE_RUN_STATE, started('the-owner', 60));

    expect(state.phase).toBe('running');
    expect(state.requestedBy).toBe('the-owner');
    expect(state.languageId).toBe(60);
  });

  test('a non-zero status is still a finished run, not a failure', () => {
    // The sandbox ran the code and is reporting a crash. That is a verdict,
    // not an operational problem, and the two render very differently.
    const crashed: RunResult = { ...RESULT, status_id: 11, status: 'Runtime Error (NZEC)', stderr: 'boom' };
    const state = reduceRunState(reduceRunState(IDLE_RUN_STATE, started()), {
      type: 'run:result',
      requested_by: 'user-1',
      result: crashed,
    });

    expect(state.phase).toBe('done');
    expect(state.failure).toBeNull();
    expect(state.result?.stderr).toBe('boom');
  });

  test.each([
    ['forbidden', /owner/i],
    ['unsupported', /no sandbox/i],
    ['run_failed', /could not be reached/i],
    ['bad_request', /could not read/i],
  ] as const)('%s fails the run with readable text', (code, matcher) => {
    const state = reduceRunState(IDLE_RUN_STATE, { type: 'error', code, message: 'server prose' });

    expect(state.phase).toBe('failed');
    expect(state.failure?.code).toBe(code);
    expect(state.failure?.message).toMatch(matcher);
    // The server's own wording is for logs, not for the pane.
    expect(state.failure?.message).not.toBe('server prose');
  });

  test('run_in_progress keeps showing the run that is actually going', () => {
    // Two tabs of the same owner: the second click is refused, but the first
    // run is still executing and its result will broadcast to both.
    const running = reduceRunState(IDLE_RUN_STATE, started());
    const state = reduceRunState(running, {
      type: 'error',
      code: 'run_in_progress',
      message: 'a run is already in progress',
    });

    expect(state.phase).toBe('running');
    expect(state.failure).toBeNull();
  });

  test('a failure clears a stale result so the pane cannot show both', () => {
    const done = reduceRunState(reduceRunState(IDLE_RUN_STATE, started()), {
      type: 'run:result',
      requested_by: 'user-1',
      result: RESULT,
    });
    const failed = reduceRunState(done, { type: 'error', code: 'run_failed', message: '' });

    expect(failed.result).toBeNull();
  });
});

describe('local transitions', () => {
  test('a click shows running before the server has answered', () => {
    expect(beginLocalRun(IDLE_RUN_STATE, 71, 'me')).toMatchObject({
      phase: 'running',
      requestedBy: 'me',
      languageId: 71,
      result: null,
      failure: null,
    });
  });

  test('a closed socket is reported rather than left spinning forever', () => {
    const state = localRunFailure(beginLocalRun(IDLE_RUN_STATE, 71, 'me'));

    expect(state.phase).toBe('failed');
    expect(state.failure?.code).toBe('offline');
  });
});

describe('the run sequence', () => {
  test('changes even when a run starts and finishes in one batch', () => {
    // React batches, so a fast run can go idle -> done without ever
    // rendering as `running`. Anything watching for that transition would
    // miss the run; the sequence still moves.
    const running = reduceRunState(IDLE_RUN_STATE, started());
    const done = reduceRunState(running, {
      type: 'run:result',
      requested_by: 'u1',
      result: RESULT,
    });

    expect(done.sequence).not.toBe(IDLE_RUN_STATE.sequence);
    expect(done.phase).toBe('done');
  });

  test('moves again for the next run, so a second one reopens the pane', () => {
    const first = reduceRunState(IDLE_RUN_STATE, started());
    const second = reduceRunState(first, started());

    expect(second.sequence).toBe(first.sequence + 1);
  });

  test('a result does not count as a new run', () => {
    const running = reduceRunState(IDLE_RUN_STATE, started());
    const done = reduceRunState(running, { type: 'run:result', requested_by: 'u1', result: RESULT });

    expect(done.sequence).toBe(running.sequence);
  });
});
