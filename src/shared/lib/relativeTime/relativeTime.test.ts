import { describe, expect, test } from 'vitest';
import { relativeTime } from './relativeTime';

const NOW = Date.parse('2026-07-28T12:00:00Z');

describe('relativeTime', () => {
  test('returns null when there is no usable timestamp', () => {
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime(undefined, NOW)).toBeNull();
    expect(relativeTime('not-a-date', NOW)).toBeNull();
  });

  test('describes recent activity', () => {
    expect(relativeTime('2026-07-28T11:59:30Z', NOW)).toBe('just now');
    expect(relativeTime('2026-07-28T11:45:00Z', NOW)).toBe('15 min ago');
    expect(relativeTime('2026-07-28T11:00:00Z', NOW)).toBe('1 hr ago');
    expect(relativeTime('2026-07-28T06:00:00Z', NOW)).toBe('6 hrs ago');
  });

  test('describes older activity', () => {
    expect(relativeTime('2026-07-27T12:00:00Z', NOW)).toBe('yesterday');
    expect(relativeTime('2026-07-25T12:00:00Z', NOW)).toBe('3 days ago');
  });

  test('falls back to a date beyond a week', () => {
    expect(relativeTime('2026-06-01T12:00:00Z', NOW)).toMatch(/Jun/);
  });

  test('treats a clock-skewed future timestamp as just now', () => {
    expect(relativeTime('2026-07-28T12:05:00Z', NOW)).toBe('just now');
  });
});
