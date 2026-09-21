/**
 * Saves that have been sent but not yet answered, app-wide.
 *
 * The editor persists a document's text a moment after typing stops, and when
 * the file is closed. Anything that then reads that text back from the server
 * — the preview loading the rest of the project on Run — can overtake the
 * save and read what was there before. Registering each save here lets such
 * a reader wait for the ones already in flight first.
 */
const pending = new Set<Promise<unknown>>();

/** Tracks `write` until it settles, and hands it back unchanged. */
export function trackPendingWrite<T>(write: Promise<T>): Promise<T> {
  pending.add(write);
  const forget = () => {
    pending.delete(write);
  };
  write.then(forget, forget);
  return write;
}

/**
 * Resolves once every save in flight when it was called has settled, or after
 * `timeoutMs`, whichever comes first — a hung request must not park a Run.
 * Never rejects: a failed save is the saver's to report.
 */
export async function settlePendingWrites(timeoutMs = 5_000): Promise<void> {
  if (pending.size === 0) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([Promise.allSettled([...pending]).then(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** How many saves are in flight; for tests. */
export function pendingWriteCount(): number {
  return pending.size;
}
