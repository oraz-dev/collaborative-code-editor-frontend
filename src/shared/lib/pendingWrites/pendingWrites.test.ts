import { pendingWriteCount, settlePendingWrites, trackPendingWrite } from './pendingWrites';

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('pendingWrites', () => {
  test('waits for a save in flight before resolving', async () => {
    const save = deferred();
    trackPendingWrite(save.promise);

    let settled = false;
    const waiting = settlePendingWrites().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    save.resolve();
    await waiting;
    expect(settled).toBe(true);
    expect(pendingWriteCount()).toBe(0);
  });

  test('a failed save does not make the wait fail', async () => {
    const save = deferred();
    trackPendingWrite(save.promise).catch(() => undefined);
    const waiting = settlePendingWrites();
    save.reject(new Error('offline'));
    await expect(waiting).resolves.toBeUndefined();
  });

  test('resolves at once with nothing in flight', async () => {
    await expect(settlePendingWrites()).resolves.toBeUndefined();
  });

  // Last: the hung save stays registered for the rest of the file.
  test('gives up after the timeout, so a hung save never parks the caller', async () => {
    vi.useFakeTimers();
    try {
      trackPendingWrite(new Promise(() => undefined));
      const waiting = settlePendingWrites(100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(waiting).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
