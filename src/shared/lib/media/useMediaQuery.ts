import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a media query.
 *
 * Layout that only *looks* different belongs in CSS. This is for layout that
 * *behaves* differently — the file tree is a persistent pane on a desktop and a
 * dismissable drawer on a phone, which changes which elements exist, what they
 * trap focus over, and whether a resize handle is rendered at all. None of that
 * can be expressed in a media query.
 *
 * `useSyncExternalStore` rather than `useState` + an effect so the first render
 * already has the right answer; the effect version paints the desktop layout
 * for one frame on every phone load.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // Server/prerender has no viewport; assume the desktop layout.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The two thresholds the app actually branches on. They mirror `$bp-sm` and
 * `$bp-md` in `app/styles/breakpoints.scss` — if one moves, move both.
 */
export const MEDIA = {
  /** Phone: a single pane fits, everything else is an overlay. */
  phone: '(max-width: 640px)',
  /** Phone or tablet portrait: the file tree becomes a drawer. */
  compact: '(max-width: 1024px)',
} as const;

export function useIsPhone(): boolean {
  return useMediaQuery(MEDIA.phone);
}

export function useIsCompact(): boolean {
  return useMediaQuery(MEDIA.compact);
}
