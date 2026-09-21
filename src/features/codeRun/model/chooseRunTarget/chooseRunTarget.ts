import type { Language } from '@/entities/Language';

/**
 * Which engine a file runs on.
 *
 * - `preview` — the in-browser sandboxed iframe. Real DOM, instant, works
 *   offline, and is the only one of the two that can render anything.
 * - `sandbox` — the server's Judge0 sandbox. A single file in, stdout and
 *   stderr out. No DOM, no network, no package installs.
 * - `null` — nothing here can run this file.
 */
export type RunEngine = 'preview' | 'sandbox';

export interface RunTarget {
  engine: RunEngine;
  /** Set only for `sandbox`; the preview needs no language id. */
  language: Language | null;
}

export interface ChooseRunTargetOptions {
  /** True when the in-browser preview understands this file — HTML/CSS/JS/TS. */
  previewable: boolean;
  /** The server language for this file, or null if the sandbox has none. */
  language: Language | null;
}

/**
 * Picks the engine, preferring the browser.
 *
 * A `.js` or `.ts` file can go either way, and the preview wins: it renders
 * DOM, updates without a round trip, and keeps working when the sandbox is
 * down. Sending it to Judge0 instead would turn a rendered page into a blank
 * stdout dump.
 *
 * Everything the preview cannot open — Python, Go, Rust, Java — goes to the
 * sandbox if the deployment offers it.
 */
export function chooseRunTarget(options: ChooseRunTargetOptions): RunTarget | null {
  const { previewable, language } = options;

  if (previewable) return { engine: 'preview', language: null };
  if (language) return { engine: 'sandbox', language };
  return null;
}

/**
 * Why a file has no Run button, phrased for the person looking at it.
 *
 * `null` means it can run, so there is nothing to explain.
 */
export function whyNotRunnable(fileName: string, target: RunTarget | null): string | null {
  if (target) return null;
  return `There is no runner for ${fileName} — the browser preview doesn’t open this kind of file, and the server’s sandbox has no language for it.`;
}
