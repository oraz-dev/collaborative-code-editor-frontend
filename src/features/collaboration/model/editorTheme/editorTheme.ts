import type { Monaco } from '@monaco-editor/react';

export const EDITOR_THEME_DARK = 'space-dark';
export const EDITOR_THEME_LIGHT = 'space-light';

/**
 * Monaco ships with `vs-dark`, whose slate-blue chrome sits a few shades off
 * every surface around it — the editor read as a screenshot pasted into the
 * app. These themes restate the app's own palette as editor colours so the
 * surface, gutter and syntax all belong to the same design system.
 *
 * The values are literals rather than `var(--…)` lookups because Monaco parses
 * them itself and only understands hex.
 */
export function defineEditorThemes(monaco: Monaco): void {
  monaco.editor.defineTheme(EDITOR_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'eef1f7' },
      { token: 'comment', foreground: '6b7488', fontStyle: 'italic' },
      { token: 'keyword', foreground: '9d7cff' },
      { token: 'keyword.control', foreground: '9d7cff' },
      { token: 'string', foreground: '2fc88e' },
      { token: 'string.escape', foreground: '5fd6a4' },
      { token: 'number', foreground: 'e7ab43' },
      { token: 'regexp', foreground: '5fd6a4' },
      { token: 'operator', foreground: 'b0b8cc' },
      { token: 'delimiter', foreground: '8a92a4' },
      { token: 'type', foreground: '36c5cf' },
      { token: 'type.identifier', foreground: '36c5cf' },
      { token: 'function', foreground: '5aa1ff' },
      { token: 'variable', foreground: 'eef1f7' },
      { token: 'variable.predefined', foreground: 'f28d7e' },
      { token: 'constant', foreground: 'e7ab43' },
      { token: 'tag', foreground: 'ef6c5a' },
      { token: 'attribute.name', foreground: 'e7ab43' },
      { token: 'attribute.value', foreground: '2fc88e' },
      { token: 'metatag', foreground: '9d7cff' },
    ],
    colors: {
      'editor.background': '#14161f',
      'editor.foreground': '#eef1f7',
      'editorGutter.background': '#14161f',
      'editorLineNumber.foreground': '#3b4254',
      'editorLineNumber.activeForeground': '#b0b8cc',
      'editor.lineHighlightBackground': '#191c27',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#4d9eff33',
      'editor.inactiveSelectionBackground': '#4d9eff1f',
      'editor.selectionHighlightBackground': '#4d9eff22',
      'editor.wordHighlightBackground': '#9d7cff26',
      'editorCursor.foreground': '#4d9eff',
      'editorIndentGuide.background1': '#1e2231',
      'editorIndentGuide.activeBackground1': '#3b4254',
      'editorWhitespace.foreground': '#272c3b',
      'editorBracketMatch.background': '#4d9eff26',
      'editorBracketMatch.border': '#4d9eff66',
      'editorWidget.background': '#11131b',
      'editorWidget.border': '#3b4254',
      'editorSuggestWidget.background': '#11131b',
      'editorSuggestWidget.selectedBackground': '#4d9eff26',
      'editorHoverWidget.background': '#11131b',
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#3b425466',
      'scrollbarSlider.hoverBackground': '#3b4254aa',
      'scrollbarSlider.activeBackground': '#4d5468cc',
      'minimap.background': '#14161f',
    },
  });

  monaco.editor.defineTheme(EDITOR_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '11141b' },
      { token: 'comment', foreground: '8a92a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: '6d46d0' },
      { token: 'keyword.control', foreground: '6d46d0' },
      { token: 'string', foreground: '1a7a52' },
      { token: 'string.escape', foreground: '22a374' },
      { token: 'number', foreground: 'b4741f' },
      { token: 'regexp', foreground: '22a374' },
      { token: 'operator', foreground: '4a5161' },
      { token: 'delimiter', foreground: '6b7488' },
      { token: 'type', foreground: '0f7d86' },
      { token: 'type.identifier', foreground: '0f7d86' },
      { token: 'function', foreground: '2a6fd4' },
      { token: 'variable', foreground: '11141b' },
      { token: 'variable.predefined', foreground: 'c94d3d' },
      { token: 'constant', foreground: 'b4741f' },
      { token: 'tag', foreground: 'c94d3d' },
      { token: 'attribute.name', foreground: 'b4741f' },
      { token: 'attribute.value', foreground: '1a7a52' },
      { token: 'metatag', foreground: '6d46d0' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#11141b',
      'editorGutter.background': '#ffffff',
      'editorLineNumber.foreground': '#c7cedb',
      'editorLineNumber.activeForeground': '#4a5161',
      'editor.lineHighlightBackground': '#f1f4f9',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#3a83e630',
      'editor.inactiveSelectionBackground': '#3a83e61a',
      'editorCursor.foreground': '#3a83e6',
      'editorIndentGuide.background1': '#e8ecf3',
      'editorIndentGuide.activeBackground1': '#c7cedb',
      'editorWhitespace.foreground': '#dce1ea',
      'editorBracketMatch.background': '#3a83e626',
      'editorBracketMatch.border': '#3a83e666',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#c7cedb',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.selectedBackground': '#3a83e61f',
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#c7cedb80',
      'scrollbarSlider.hoverBackground': '#c7cedbcc',
      'minimap.background': '#ffffff',
    },
  });
}
