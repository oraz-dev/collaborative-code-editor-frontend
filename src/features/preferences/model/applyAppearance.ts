import { ACCENT_COLORS, type AppearancePreferences, type ThemePreference } from './types/preferences';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: ThemePreference): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Turns `#9d7cff` into `157, 124, 255` so it can be used inside rgba(). */
function toRgbChannels(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * Writes the chosen theme and accent onto the document.
 *
 * The stylesheets key off `[data-theme]`, and the accent overrides the three
 * variables derived from it, so a change is picked up everywhere at once
 * without a re-render.
 */
export function applyAppearance(appearance: AppearancePreferences): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(appearance.theme);

  const accent = ACCENT_COLORS[appearance.accent];
  const channels = toRgbChannels(accent);

  // The accent drives the primary family too, otherwise the setting would only
  // repaint a variable nothing visible uses — buttons, active nav and focus
  // rings are what people expect an accent to change.
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--fill-accent', `rgba(${channels}, 0.14)`);
  root.style.setProperty('--color-primary', accent);
  root.style.setProperty('--color-primary-hover', `color-mix(in srgb, ${accent} 86%, white)`);
  root.style.setProperty('--color-primary-press', `color-mix(in srgb, ${accent} 86%, black)`);
  root.style.setProperty('--fill-primary', `rgba(${channels}, 0.14)`);
  root.style.setProperty('--ring', `rgba(${channels}, 0.40)`);
}

/**
 * Notifies when the OS theme flips, so "System" keeps up without a reload.
 * Returns a no-op unsubscribe when the browser has no matchMedia.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};

  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
