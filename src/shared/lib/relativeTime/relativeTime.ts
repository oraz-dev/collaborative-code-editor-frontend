const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Short human-readable age ("2 min ago"). Returns null for missing or
 * zero-value timestamps so callers can omit the line entirely rather than
 * printing a meaningless date.
 */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;

  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;

  const elapsed = now - timestamp;
  if (elapsed < 0) return 'just now';
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} min ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
  }
  if (elapsed < WEEK) {
    const days = Math.floor(elapsed / DAY);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
