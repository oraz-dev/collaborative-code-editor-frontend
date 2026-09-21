/**
 * The socket's control plane.
 *
 * One socket carries two planes, told apart by the WebSocket frame type
 * rather than by anything inside the payload:
 *
 * - **binary** — the CRDT plane. Opaque Yjs bytes the relay forwards to the
 *   rest of the room without parsing.
 * - **text** — the control plane. JSON the *server itself* acts on. These are
 *   never relayed between peers, so a text frame is always a conversation
 *   with the server.
 *
 * Browsers already make that split for free: a `Uint8Array` goes out binary
 * and a `JSON.stringify` string goes out text.
 */

/** Outbound: ask the server to execute the document's code. Host-only. */
export const RUN = 'run';

/** Inbound: the run was accepted. Broadcast to the whole room. */
export const RUN_STARTED = 'run:started';

/** Inbound: the sandbox answered. Broadcast to the whole room. */
export const RUN_RESULT = 'run:result';

/** Inbound: addressed to this client alone, never broadcast. */
export const ERROR = 'error';

/**
 * Error codes the server switches on. Stable wire strings, not prose — the
 * human-readable `message` beside them is for logs, not for branching.
 */
export type RunErrorCode =
  /** In the room, possibly even able to edit, but not the host. */
  | 'forbidden'
  /** Unparseable JSON, unknown type, or a run missing its language or source. */
  | 'bad_request'
  /** This deployment has no sandbox wired up at all. */
  | 'unsupported'
  /** One run per document at a time; another is still going. */
  | 'run_in_progress'
  /** The sandbox was unreachable or errored — *not* the program failing. */
  | 'run_failed';

export interface RunRequestFrame {
  type: typeof RUN;
  language_id: number;
  source_code: string;
  stdin?: string;
}

/**
 * The sandbox's verdict.
 *
 * Judge0 reports most of these as nullable, and the server flattens null to
 * `''` so clients don't each have to handle both shapes. A non-zero
 * `status_id` is still a *successful* run: the sandbox executed the code and
 * is reporting what happened.
 */
export interface RunResult {
  stdout: string;
  stderr: string;
  compile_output: string;
  message: string;
  status_id: number;
  status: string;
  /** Wall-clock seconds, as a string — e.g. `"0.012"`. Empty if unreported. */
  time: string;
  /** Kilobytes. */
  memory: number;
}

export interface RunStartedFrame {
  type: typeof RUN_STARTED;
  requested_by: string;
  language_id: number;
}

export interface RunResultFrame {
  type: typeof RUN_RESULT;
  requested_by: string;
  result: RunResult;
}

export interface ErrorFrame {
  type: typeof ERROR;
  code: RunErrorCode;
  message: string;
}

/** Everything the server can send on the control plane. */
export type ControlFrame = RunStartedFrame | RunResultFrame | ErrorFrame;

/**
 * Narrows an already-parsed text frame.
 *
 * Deliberately shallow: it checks the discriminant and nothing else, so a
 * server that adds a field to `result` keeps working. The alternative —
 * validating every field — would reject frames this client can still render
 * perfectly well.
 */
export function asControlFrame(value: unknown): ControlFrame | null {
  if (typeof value !== 'object' || value === null) return null;
  const type = (value as { type?: unknown }).type;

  if (type === RUN_STARTED || type === RUN_RESULT || type === ERROR) {
    return value as ControlFrame;
  }
  return null;
}

/** Judge0 status ids. Only the two the UI branches on are named. */
export const RUN_STATUS_ACCEPTED = 3;

/** Compilation failed, so nothing ran. Its detail is in `compile_output`. */
export const RUN_STATUS_COMPILE_ERROR = 6;
