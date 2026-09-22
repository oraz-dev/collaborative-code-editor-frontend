import { describe, expect, test } from 'vitest';
import { TypeProgressStore } from './typeProgress';

/** Frames run only when the test says so, like a paused browser. */
function store() {
  const frames: Array<() => void> = [];
  const progress = new TypeProgressStore((callback) => frames.push(callback));
  const flush = () => frames.splice(0).forEach((callback) => callback());
  return { progress, flush };
}

const at = (filesDone: number, filesFound: number) => ({ source: 'x', version: '1.0.0', filesDone, filesFound });

describe('TypeProgressStore', () => {
  test('a package’s bar never slides back when more files are discovered', () => {
    const { progress, flush } = store();
    progress.setWanted(['date-fns']);
    progress.start('date-fns');

    progress.update('date-fns', at(1, 2));
    flush();
    expect(progress.getSnapshot().packages[0].percent).toBe(50);

    // index.d.ts revealed 500 more: 1/502 would be 0%.
    progress.update('date-fns', at(2, 502));
    flush();
    expect(progress.getSnapshot().packages[0].percent).toBe(50);
  });

  test('stays below 100 until the package has settled', () => {
    const { progress, flush } = store();
    progress.setWanted(['react']);
    progress.start('react');
    progress.update('react', at(10, 10));
    flush();
    expect(progress.getSnapshot().packages[0].percent).toBe(99);

    progress.finish('react', 'ready');
    flush();
    expect(progress.getSnapshot()).toMatchObject({ active: false, settled: 1, total: 1, percent: 100 });
  });

  test('overall progress averages the packages and counts settled ones', () => {
    const { progress, flush } = store();
    progress.setWanted(['a', 'b']);
    progress.start('a');
    progress.start('b');
    progress.update('a', at(1, 2));
    progress.finish('b', 'untyped');
    flush();

    expect(progress.getSnapshot()).toMatchObject({ active: true, settled: 1, total: 2, percent: 75 });
  });

  test('shows only the open project’s packages', () => {
    const { progress, flush } = store();
    progress.start('lodash');
    progress.start('react');
    progress.setWanted(['react']);
    flush();

    expect(progress.getSnapshot().packages.map((entry) => entry.name)).toEqual(['react']);
  });

  test('hundreds of file events cost one notification per frame', () => {
    const { progress, flush } = store();
    let notified = 0;
    progress.subscribe(() => { notified += 1; });
    progress.setWanted(['a']);
    progress.start('a');
    for (let file = 1; file <= 300; file += 1) progress.update('a', at(file, 300));

    flush();
    expect(notified).toBe(1);
  });
});
