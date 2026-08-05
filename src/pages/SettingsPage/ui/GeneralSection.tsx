import { memo, useCallback } from 'react';
import { Select } from '@/shared/ui/Select/Select';
import {
  preferencesStore,
  useAppearancePreferences,
  type AccentPreference,
  type ThemePreference,
} from '@/features/preferences';
import cls from '../SettingsPage.module.scss';

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Match system' },
];

const ACCENT_OPTIONS = [
  { value: 'violet', label: 'Violet' },
  { value: 'azure', label: 'Azure' },
  { value: 'mint', label: 'Mint' },
  { value: 'coral', label: 'Coral' },
];

/**
 * Appearance only. Workspace name and URL used to live here, but the API has
 * no workspace concept, so they were removed rather than left as fields that
 * quietly discard what you type.
 */
export const GeneralSection = memo(() => {
  const appearance = useAppearancePreferences();

  const onThemeChange = useCallback((value: string) => {
    preferencesStore.setAppearance({ theme: value as ThemePreference });
  }, []);

  const onAccentChange = useCallback((value: string) => {
    preferencesStore.setAppearance({ accent: value as AccentPreference });
  }, []);

  return (
    <div className={cls.section}>
      <div className={cls.secHead}>
        <span className={cls.secTitle}>Appearance</span>
        <span className={cls.secHint}>Saved on this device</span>
      </div>
      <div className={cls.secBody}>
        <div className={cls.row}>
          <div className={cls.rowLabel}>
            <div className={cls.rowTitle}>Theme</div>
            <div className={cls.rowDesc}>Choose a color theme for the app.</div>
          </div>
          <div className={cls.rowControl}>
            <Select
              className={cls.control}
              value={appearance.theme}
              onChange={onThemeChange}
              options={THEME_OPTIONS}
            />
          </div>
        </div>

        <div className={cls.row}>
          <div className={cls.rowLabel}>
            <div className={cls.rowTitle}>Accent color</div>
            <div className={cls.rowDesc}>Used for highlights, links and focus rings.</div>
          </div>
          <div className={cls.rowControl}>
            <Select
              className={cls.control}
              value={appearance.accent}
              onChange={onAccentChange}
              options={ACCENT_OPTIONS}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
