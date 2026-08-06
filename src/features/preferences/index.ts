export { preferencesStore, PREFERENCES_STORAGE_KEY } from './model/preferencesStore';
export {
  usePreferences,
  useAppearancePreferences,
  useCollaborationPreferences,
  useEditorPreferences,
  useLayoutPreferences,
} from './model/usePreferences';
export { applyAppearance, resolveTheme, watchSystemTheme } from './model/applyAppearance';
export { useResolvedTheme } from './model/useResolvedTheme';
export {
  ACCENT_COLORS,
  DEFAULT_PREFERENCES,
  EDITOR_FONT_STACKS,
  FONT_SIZE_RANGE,
  TAB_SIZE_RANGE,
  normalisePreferences,
  TREE_WIDTH_RANGE,
  PREVIEW_WIDTH_RANGE,
  CONSOLE_HEIGHT_RANGE,
} from './model/types/preferences';
export type {
  AccentPreference,
  AppearancePreferences,
  CollaborationPreferences,
  EditorFontPreference,
  EditorPreferences,
  LayoutPreferences,
  Preferences,
  ThemePreference,
} from './model/types/preferences';
