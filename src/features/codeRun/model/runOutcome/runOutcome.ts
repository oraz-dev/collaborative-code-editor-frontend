import type { RunResult } from '@/features/collaboration';

/**
 * What a finished run actually amounts to.
 *
 * Judge0 reports a numeric status, and the interesting distinction for a
 * person is not the number but whether their program ran, refused to build,
 * or was cut off. Each maps to a different thing to read: compile output,
 * stdout, or neither.
 */
export type RunOutcome = 'ok' | 'compile-error' | 'runtime-error' | 'timeout' | 'internal';

/** Judge0 status ids. */
const ACCEPTED = 3;
const WRONG_ANSWER = 4;
const TIME_LIMIT = 5;
const COMPILE_ERROR = 6;
/** 7–12 are the signals: SIGSEGV, SIGXFSZ, SIGFPE, SIGABRT, NZEC, other. */
const RUNTIME_FIRST = 7;
const RUNTIME_LAST = 12;

export function runOutcome(result: RunResult): RunOutcome {
  const { status_id: status } = result;

  // There is no expected output here, so "wrong answer" only happens when
  // something submits one — treat it as a normal finish.
  if (status === ACCEPTED || status === WRONG_ANSWER) return 'ok';
  if (status === COMPILE_ERROR) return 'compile-error';
  if (status === TIME_LIMIT) return 'timeout';
  if (status >= RUNTIME_FIRST && status <= RUNTIME_LAST) return 'runtime-error';
  return 'internal';
}

/**
 * The streams worth showing, in reading order, with empty ones dropped.
 *
 * Compile output comes first when it exists: if the build failed, nothing
 * ran, and stdout from a previous life would only mislead.
 */
export function runStreams(result: RunResult): { label: string; text: string; tone: 'out' | 'err' }[] {
  const streams: { label: string; text: string; tone: 'out' | 'err' }[] = [];

  if (result.compile_output.trim()) {
    streams.push({ label: 'Compiler', text: result.compile_output, tone: 'err' });
  }
  if (result.stdout) {
    streams.push({ label: 'Output', text: result.stdout, tone: 'out' });
  }
  if (result.stderr.trim()) {
    streams.push({ label: 'Errors', text: result.stderr, tone: 'err' });
  }
  // Judge0's own note — "Time limit exceeded" and the like. Only useful when
  // the program itself said nothing.
  if (result.message.trim() && streams.length === 0) {
    streams.push({ label: 'Sandbox', text: result.message, tone: 'err' });
  }

  return streams;
}

/** `"0.012"` -> `"12 ms"`; blank when the sandbox did not report a time. */
export function formatRunTime(seconds: string): string {
  const value = Number.parseFloat(seconds);
  if (!Number.isFinite(value)) return '';
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
}

/** Judge0 reports kilobytes. */
export function formatRunMemory(kilobytes: number): string {
  if (!Number.isFinite(kilobytes) || kilobytes <= 0) return '';
  return kilobytes < 1024 ? `${kilobytes} KB` : `${(kilobytes / 1024).toFixed(1)} MB`;
}
