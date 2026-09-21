import {
  ERROR,
  RUN_RESULT,
  RUN_STARTED,
  type ControlFrame,
  type RunErrorCode,
  type RunResult,
} from '../types/controlFrames';

export type RunPhase = 'idle' | 'running' | 'done' | 'failed';

export interface RunFailure {
  code: RunErrorCode | 'offline';
  /** Already phrased for a person; the server's own text is for logs. */
  message: string;
}

export interface RunState {
  phase: RunPhase;
  /**
   * Bumped once per run.
   *
   * A watcher cannot rely on seeing `phase` pass through `running`: React
   * batches updates, so a run that starts and finishes inside one tick goes
   * straight from `idle` to `done` and the transition is never observable.
   * This changes exactly once per run, however the phases collapse.
   */
  sequence: number;
  /** User id of whoever triggered this run — not necessarily the viewer. */
  requestedBy: string | null;
  languageId: number | null;
  result: RunResult | null;
  failure: RunFailure | null;
}

export const IDLE_RUN_STATE: RunState = {
  phase: 'idle',
  sequence: 0,
  requestedBy: null,
  languageId: null,
  result: null,
  failure: null,
};

/**
 * What each refusal means to the person looking at the screen.
 *
 * The server sends prose alongside the code, but it is written for a log:
 * "only the document host may run code" describes the rule, not what the
 * reader should do about it.
 */
const FAILURE_TEXT: Record<RunErrorCode, string> = {
  forbidden: 'Only the document’s owner can run it.',
  bad_request: 'The server could not read that run request.',
  unsupported: 'This server has no sandbox, so code cannot be run here.',
  run_in_progress: 'A run is already going for this file.',
  run_failed: 'The sandbox could not be reached. Try again in a moment.',
};

export function describeFailure(code: RunErrorCode): string {
  return FAILURE_TEXT[code] ?? 'The run could not be completed.';
}

/**
 * Folds one control frame into the run state.
 *
 * Pure, and separated from the socket, because the interesting behaviour is
 * all in the ordering: a result arriving for someone else's run, an error
 * landing after a result, a second run starting before the first reported.
 * Those are worth testing without a WebSocket in the way.
 */
export function reduceRunState(state: RunState, frame: ControlFrame): RunState {
  switch (frame.type) {
    case RUN_STARTED:
      // A run is broadcast to the whole room, so this also fires for a run
      // somebody else started — everyone watches the same execution.
      return {
        phase: 'running',
        sequence: state.sequence + 1,
        requestedBy: frame.requested_by,
        languageId: frame.language_id,
        result: null,
        failure: null,
      };

    case RUN_RESULT:
      return {
        ...state,
        phase: 'done',
        requestedBy: frame.requested_by,
        result: frame.result,
        failure: null,
      };

    case ERROR: {
      // `run_in_progress` is not a failure: it means the run the room is
      // already watching is still going, which is exactly what the UI should
      // keep showing. Anything else ends the attempt.
      if (frame.code === 'run_in_progress') {
        return { ...state, phase: 'running', failure: null };
      }

      return {
        ...state,
        phase: 'failed',
        result: null,
        failure: { code: frame.code, message: describeFailure(frame.code) },
      };
    }

    default:
      return state;
  }
}

/** Local transition for the moment the button is pressed, before the server answers. */
export function beginLocalRun(
  state: RunState,
  languageId: number,
  requestedBy: string | null,
): RunState {
  return {
    phase: 'running',
    // The server's own `run:started` bumps it again a moment later. Both are
    // real run boundaries, and a watcher only cares that it changed.
    sequence: state.sequence + 1,
    requestedBy,
    languageId,
    result: null,
    failure: null,
  };
}

/** The socket was not open, so nothing was ever sent. */
export function localRunFailure(state: RunState): RunState {
  return {
    ...state,
    phase: 'failed',
    result: null,
    failure: {
      code: 'offline',
      message: 'You are not connected to this document, so it cannot be run.',
    },
  };
}
