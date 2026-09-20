import { describe, expect, test } from 'vitest';
import type { RunResult } from '@/features/collaboration';
import { formatRunMemory, formatRunTime, runOutcome, runStreams } from './runOutcome';

const result = (over: Partial<RunResult> = {}): RunResult => ({
  stdout: '',
  stderr: '',
  compile_output: '',
  message: '',
  status_id: 3,
  status: 'Accepted',
  time: '0.01',
  memory: 1024,
  ...over,
});

describe('runOutcome', () => {
  test.each([
    [3, 'ok'],
    [4, 'ok'],
    [5, 'timeout'],
    [6, 'compile-error'],
    [7, 'runtime-error'],
    [11, 'runtime-error'],
    [12, 'runtime-error'],
    [13, 'internal'],
  ] as const)('status %i is %s', (status_id, expected) => {
    expect(runOutcome(result({ status_id }))).toBe(expected);
  });

  test('a status this build has never seen is treated as the sandbox failing', () => {
    expect(runOutcome(result({ status_id: 99 }))).toBe('internal');
  });
});

describe('runStreams', () => {
  test('compile output comes first, because nothing ran', () => {
    const streams = runStreams(result({
      status_id: 6,
      compile_output: 'error: expected ;',
      stdout: 'stale',
    }));

    expect(streams[0].label).toBe('Compiler');
    expect(streams[0].tone).toBe('err');
  });

  test('empty streams are dropped rather than rendered as blank sections', () => {
    expect(runStreams(result({ stdout: 'hi\n' })).map((s) => s.label)).toEqual(['Output']);
  });

  test('whitespace-only stderr is not output', () => {
    // Judge0 flattens null to '', and some runtimes emit a lone newline.
    expect(runStreams(result({ stdout: 'hi', stderr: '\n  ' }))).toHaveLength(1);
  });

  test("the sandbox's own note is shown only when the program said nothing", () => {
    expect(runStreams(result({ message: 'Time limit exceeded' }))[0].label).toBe('Sandbox');
    expect(runStreams(result({ message: 'Time limit exceeded', stdout: 'partial' })))
      .toHaveLength(1);
  });

  test('a run that printed nothing has no streams at all', () => {
    expect(runStreams(result())).toEqual([]);
  });
});

describe('formatting', () => {
  test('sub-second times read as milliseconds', () => {
    expect(formatRunTime('0.012')).toBe('12 ms');
    expect(formatRunTime('1.5')).toBe('1.50 s');
  });

  test('an unreported time formats to nothing rather than NaN', () => {
    expect(formatRunTime('')).toBe('');
  });

  test('memory reads in the larger unit once it earns one', () => {
    expect(formatRunMemory(512)).toBe('512 KB');
    expect(formatRunMemory(2048)).toBe('2.0 MB');
    expect(formatRunMemory(0)).toBe('');
  });
});
