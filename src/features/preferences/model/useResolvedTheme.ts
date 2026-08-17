import { useSyncExternalStore } from 'react';
import { watchSystemTheme } from './applyAppearance';
import { useAppearancePreferences } from './usePreferences';

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getServerTheme(): 'dark' | 'light' {
  return 'dark';
}

/**
 * The theme actually in effect, with `system` collapsed to dark or light and
 * kept current if the OS flips.
 *
 * The OS preference is subscribed to as an external store rather than mirrored
 * into state, so there is no effect writing state on every render pass — the
 * value is simply derived from the two inputs.
 *
 * Components that need to *render* differently per theme (Monaco, canvases)
 * use this; anything styled with CSS variables does not need it.
 */
export function useResolvedTheme(): 'dark' | 'light' {
  const { theme } = useAppearancePreferences();
  const systemTheme = useSyncExternalStore(watchSystemTheme, getSystemTheme, getServerTheme);

  return theme === 'system' ? systemTheme : theme;
}
