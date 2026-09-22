import type { AcquireProgress } from '../acquireTypes/acquireTypes';

/**
 * - `loading`: resolving the version, then downloading declarations.
 * - `ready`: types registered; the editor knows the package.
 * - `untyped`: the package publishes no types anywhere — imports are `any`.
 * - `failed`: the download itself failed (offline, CDN down); can be retried.
 */
export type PackageStatus = 'loading' | 'ready' | 'untyped' | 'failed';

export interface PackageProgress {
  name: string;
  status: PackageStatus;
  /** Where the types come from when that is not the package itself: `@types/react`. */
  source: string | null;
  version: string | null;
  filesDone: number;
  filesFound: number;
  /**
   * 0–100, and never goes backwards. The total grows as declarations are
   * discovered, so a plain `done / found` would slide back each time a file
   * reveals more; instead the bar holds until the count catches up. It stays
   * below 100 until the package has really settled.
   */
  percent: number;
}

export interface TypeProgressSnapshot {
  packages: PackageProgress[];
  /** Any package still loading. */
  active: boolean;
  settled: number;
  total: number;
  /** Across every package, with the same never-backwards rule. */
  percent: number;
}

const EMPTY: TypeProgressSnapshot = { packages: [], active: false, settled: 0, total: 0, percent: 0 };

function isSettled(status: PackageStatus): boolean {
  return status !== 'loading';
}

/**
 * Progress of package type downloads, for the status bar.
 *
 * Downloads report per file — hundreds of events a second on a fast link —
 * so listeners hear about them at most once a frame.
 */
export class TypeProgressStore {
  private entries = new Map<string, PackageProgress>();

  private wanted: string[] = [];

  private overall = 0;

  private snapshot: TypeProgressSnapshot = EMPTY;

  private listeners = new Set<() => void>();

  private frame: number | null = null;

  private readonly scheduleFrame: (callback: () => void) => number;

  constructor(scheduleFrame?: (callback: () => void) => number) {
    this.scheduleFrame = scheduleFrame ?? ((callback) => (
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(callback)
        : setTimeout(callback, 16) as unknown as number
    ));
  }

  /** The packages the open project uses; the only ones shown. */
  setWanted(names: string[]): void {
    const next = [...new Set(names)];
    if (next.join('\n') === this.wanted.join('\n')) return;
    this.wanted = next;
    this.overall = 0;
    this.changed();
  }

  start(name: string): void {
    this.entries.set(name, {
      name, status: 'loading', source: null, version: null, filesDone: 0, filesFound: 0, percent: 0,
    });
    // A new download restarts the overall bar's floor, or it would sit at
    // 100% while the new package is at 0.
    this.overall = 0;
    this.changed();
  }

  update(name: string, progress: AcquireProgress): void {
    const entry = this.entries.get(name);
    if (!entry || entry.status !== 'loading') return;

    const ratio = progress.filesFound > 0 ? progress.filesDone / progress.filesFound : 0;
    this.entries.set(name, {
      ...entry,
      source: progress.source,
      version: progress.version,
      filesDone: progress.filesDone,
      filesFound: progress.filesFound,
      percent: Math.min(99, Math.max(entry.percent, Math.floor(ratio * 100))),
    });
    this.changed();
  }

  finish(name: string, status: Exclude<PackageStatus, 'loading'>): void {
    const entry = this.entries.get(name);
    if (!entry) return;
    this.entries.set(name, { ...entry, status, percent: 100 });
    this.changed();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): TypeProgressSnapshot => this.snapshot;

  private changed(): void {
    if (this.frame !== null) return;
    this.frame = this.scheduleFrame(() => {
      this.frame = null;
      this.snapshot = this.build();
      this.listeners.forEach((listener) => listener());
    });
  }

  private build(): TypeProgressSnapshot {
    const packages = this.wanted
      .map((name) => this.entries.get(name))
      .filter((entry): entry is PackageProgress => entry !== undefined);
    if (packages.length === 0) return EMPTY;

    const settled = packages.filter((entry) => isSettled(entry.status)).length;
    const average = packages.reduce((sum, entry) => sum + entry.percent, 0) / packages.length;
    this.overall = Math.max(this.overall, Math.floor(average));

    return {
      packages,
      active: settled < packages.length,
      settled,
      total: packages.length,
      percent: settled === packages.length ? 100 : Math.min(99, this.overall),
    };
  }
}
