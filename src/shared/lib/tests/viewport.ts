import { vi } from 'vitest';

/**
 * Answers `matchMedia` as though the viewport were `width` pixels wide.
 *
 * jsdom has no layout, so `matchMedia` always reports `false` and every test
 * renders the desktop branch. This parses the `max-width` / `min-width` in the
 * query — the only two forms the app uses — so a test can assert what a phone
 * actually gets.
 */
export function mockViewportWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);

    let matches = false;
    if (max) matches = width <= Number(max[1]);
    if (min) matches = width >= Number(min[1]);

    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

/** Widths worth asserting against, named so the intent survives the number. */
export const VIEWPORT = {
  phone: 390,
  tablet: 834,
  desktop: 1440,
} as const;
