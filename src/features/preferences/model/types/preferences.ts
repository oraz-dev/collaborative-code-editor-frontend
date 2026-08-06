export type ThemePreference = 'dark' | 'light' | 'system';
export type AccentPreference = 'azure' | 'violet' | 'mint' | 'coral';
export type EditorFontPreference = 'jetbrains' | 'fira' | 'sf';

export interface AppearancePreferences {
  theme: ThemePreference;
  accent: AccentPreference;
}

export interface EditorPreferences {
  fontFamily: EditorFontPreference;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  ligatures: boolean;
}

export interface CollaborationPreferences {
  /** Render other people's carets and selections in the editor. */
  liveCursors: boolean;
  /** Show the name badge attached to each remote caret. */
  cursorLabels: boolean;
}

/** Pane sizes in px, so a layout a dev settles on survives a reload. */
export interface LayoutPreferences {
  treeWidth: number;
  previewWidth: number;
  consoleHeight: number;
}

export interface Preferences {
  appearance: AppearancePreferences;
  editor: EditorPreferences;
  collaboration: CollaborationPreferences;
  layout: LayoutPreferences;
}

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: { theme: 'dark', accent: 'violet' },
  editor: {
    fontFamily: 'jetbrains',
    fontSize: 13,
    tabSize: 2,
    wordWrap: false,
    minimap: false,
    ligatures: true,
  },
  collaboration: { liveCursors: true, cursorLabels: true },
  layout: { treeWidth: 240, previewWidth: 480, consoleHeight: 160 },
};

/** Drawn from the shared presence palette so accents match collaborator colours. */
export const ACCENT_COLORS: Record<AccentPreference, string> = {
  azure: '#4d9eff',
  mint: '#2fc88e',
  violet: '#9d7cff',
  coral: '#ef6c5a',
};

/**
 * `… Variable` is the family name the bundled woff2 registers. Without it the
 * first entry never matched anything and all three options collapsed onto the
 * same system fallback, so the picker appeared to do nothing.
 */
export const EDITOR_FONT_STACKS: Record<EditorFontPreference, string> = {
  jetbrains: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  fira: "'Fira Code Variable', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace",
  sf: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
};

export const FONT_SIZE_RANGE = { min: 10, max: 24 } as const;
export const TAB_SIZE_RANGE = { min: 1, max: 8 } as const;

/*
 * Bounds for the draggable panes. The minimums are the point below which a pane
 * stops being useful rather than merely small — a file tree narrower than this
 * truncates every name, and the editor needs room left over once the preview
 * has taken its share.
 */
export const TREE_WIDTH_RANGE = { min: 180, max: 480 } as const;
export const PREVIEW_WIDTH_RANGE = { min: 280, max: 900 } as const;
export const CONSOLE_HEIGHT_RANGE = { min: 80, max: 480 } as const;

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Stored preferences are user-editable text, so every field is validated on the
 * way in — a hand-edited or stale entry falls back to its default rather than
 * poisoning the editor with, say, a font size of zero.
 */
export function normalisePreferences(raw: unknown): Preferences {
  const source = (raw ?? {}) as Partial<Record<keyof Preferences, unknown>>;
  const appearance = (source.appearance ?? {}) as Partial<AppearancePreferences>;
  const editor = (source.editor ?? {}) as Partial<EditorPreferences>;
  const collaboration = (source.collaboration ?? {}) as Partial<CollaborationPreferences>;
  const layout = (source.layout ?? {}) as Partial<LayoutPreferences>;

  return {
    appearance: {
      theme: pick(appearance.theme, ['dark', 'light', 'system'], DEFAULT_PREFERENCES.appearance.theme),
      accent: pick(appearance.accent, ['azure', 'violet', 'mint', 'coral'], DEFAULT_PREFERENCES.appearance.accent),
    },
    editor: {
      fontFamily: pick(editor.fontFamily, ['jetbrains', 'fira', 'sf'], DEFAULT_PREFERENCES.editor.fontFamily),
      fontSize: clamp(Number(editor.fontSize), FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, DEFAULT_PREFERENCES.editor.fontSize),
      tabSize: clamp(Number(editor.tabSize), TAB_SIZE_RANGE.min, TAB_SIZE_RANGE.max, DEFAULT_PREFERENCES.editor.tabSize),
      wordWrap: bool(editor.wordWrap, DEFAULT_PREFERENCES.editor.wordWrap),
      minimap: bool(editor.minimap, DEFAULT_PREFERENCES.editor.minimap),
      ligatures: bool(editor.ligatures, DEFAULT_PREFERENCES.editor.ligatures),
    },
    collaboration: {
      liveCursors: bool(collaboration.liveCursors, DEFAULT_PREFERENCES.collaboration.liveCursors),
      cursorLabels: bool(collaboration.cursorLabels, DEFAULT_PREFERENCES.collaboration.cursorLabels),
    },
    layout: {
      treeWidth: clamp(Number(layout.treeWidth), TREE_WIDTH_RANGE.min, TREE_WIDTH_RANGE.max, DEFAULT_PREFERENCES.layout.treeWidth),
      previewWidth: clamp(Number(layout.previewWidth), PREVIEW_WIDTH_RANGE.min, PREVIEW_WIDTH_RANGE.max, DEFAULT_PREFERENCES.layout.previewWidth),
      consoleHeight: clamp(Number(layout.consoleHeight), CONSOLE_HEIGHT_RANGE.min, CONSOLE_HEIGHT_RANGE.max, DEFAULT_PREFERENCES.layout.consoleHeight),
    },
  };
}
