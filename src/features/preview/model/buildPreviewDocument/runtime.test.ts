import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CONSOLE_BRIDGE } from './runtime';

/**
 * The console bridge, run.
 *
 * It is a string that executes inside the preview frame, so the only honest
 * test is to execute it: the script patches `console`, and what it does or does
 * not hand to `postMessage` is the whole contract.
 */

const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

/** Tailwind's own wording, as the CDN build prints it on every single run. */
const TAILWIND_WARNING = 'cdn.tailwindcss.com should not be used in production. To get the full developer experience and performance benefits of Tailwind CSS, install Tailwind CSS as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation';

describe('the preview console bridge', () => {
  const original = new Map<string, unknown>();
  let posted: { level?: string; text?: string; type?: string }[] = [];

  beforeEach(() => {
    for (const level of LEVELS) original.set(level, console[level]);
    posted = [];
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message as { level?: string; text?: string; type?: string });
    });

    // `parent` is this same window in jsdom, which is what the bridge posts to.
    new Function(CONSOLE_BRIDGE)();
  });

  afterEach(() => {
    for (const level of LEVELS) {
      Object.defineProperty(console, level, { value: original.get(level), writable: true, configurable: true });
    }
    vi.restoreAllMocks();
  });

  function messages() {
    return posted.filter((item) => item.type === 'console');
  }

  test('mirrors ordinary console output to the editor', () => {
    console.log('hello', 42);
    console.error('boom');

    expect(messages()).toEqual([
      expect.objectContaining({ level: 'log', text: 'hello 42' }),
      expect.objectContaining({ level: 'error', text: 'boom' }),
    ]);
  });

  test('swallows Tailwind\'s "not for production" warning, which nobody here can act on', () => {
    console.warn(TAILWIND_WARNING);

    expect(messages()).toEqual([]);
  });

  test('keeps it in the frame\'s own console, rather than losing it entirely', () => {
    const native = vi.fn();
    Object.defineProperty(console, 'warn', { value: native, writable: true, configurable: true });
    // Re-run so the bridge wraps the spy this test can watch.
    new Function(CONSOLE_BRIDGE)();

    console.warn(TAILWIND_WARNING);

    expect(native).toHaveBeenCalledWith(TAILWIND_WARNING);
    expect(messages()).toEqual([]);
  });

  test('is that one message and nothing near it', () => {
    // Same subject, different message: a real problem with the CDN.
    console.warn('Failed to load cdn.tailwindcss.com should not be used in production');
    console.warn('cdn.tailwindcss.com failed to load');
    // Same text at a level Tailwind never uses for it.
    console.error(TAILWIND_WARNING);
    console.log(TAILWIND_WARNING);

    expect(messages().map((item) => item.level)).toEqual(['warn', 'warn', 'error', 'log']);
  });
});
