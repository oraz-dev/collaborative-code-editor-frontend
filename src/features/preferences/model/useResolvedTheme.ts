import { useEffect, useState } from 'react';
import { resolveTheme, watchSystemTheme } from './applyAppearance';
import { useAppearancePreferences } from './usePreferences';

/**
 * The theme actually in effect, with `system` collapsed to dark or light and
 * kept current if the OS flips. Components that need to *render* differently
 * per theme (Monaco, canvases) use this; anything styled with CSS variables
 * doesn't need it.
 */
export function useResolvedTheme(): 'dark' | 'light' {
  const { theme } = useAppearancePreferences();
  const [resolved, setResolved] = useState(() => resolveTheme(theme));

  useEffect(() => {
    setResolved(resolveTheme(theme));
    if (theme !== 'system') return;
    return watchSystemTheme(() => setResolved(resolveTheme(theme)));
  }, [theme]);

  return resolved;
}
