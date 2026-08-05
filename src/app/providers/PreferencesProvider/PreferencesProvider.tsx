import { memo, useEffect, type ReactNode } from 'react';
import {
  applyAppearance,
  useAppearancePreferences,
  watchSystemTheme,
} from '@/features/preferences';

interface PreferencesProviderProps {
  children: ReactNode;
}

/**
 * Keeps the document in sync with the saved appearance. Rendering nothing of
 * its own means a theme change repaints via CSS variables rather than by
 * re-rendering the tree.
 */
export const PreferencesProvider = memo((props: PreferencesProviderProps) => {
  const { children } = props;
  const appearance = useAppearancePreferences();

  useEffect(() => {
    applyAppearance(appearance);

    // "System" has to track the OS flipping while the app is open.
    if (appearance.theme !== 'system') return;
    return watchSystemTheme(() => applyAppearance(appearance));
  }, [appearance]);

  return <>{children}</>;
});
