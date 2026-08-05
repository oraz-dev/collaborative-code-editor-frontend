import { memo, useCallback } from 'react';
import { Toggle } from '@/shared/ui/Toggle/Toggle';
import { Select } from '@/shared/ui/Select/Select';
import {
  preferencesStore,
  useCollaborationPreferences,
  useEditorPreferences,
  type EditorFontPreference,
} from '@/features/preferences';
import cls from '../SettingsPage.module.scss';

const FONT_OPTIONS = [
  { value: 'jetbrains', label: 'JetBrains Mono' },
  { value: 'fira', label: 'Fira Code' },
  { value: 'sf', label: 'SF Mono' },
];

// A fixed set rather than a free number field: a controlled number input snaps
// to its clamp the moment you clear it, which makes retyping a value awkward.
const FONT_SIZE_OPTIONS = [11, 12, 13, 14, 15, 16, 18, 20]
  .map((size) => ({ value: String(size), label: `${size} px` }));

const TAB_SIZE_OPTIONS = [2, 4, 8]
  .map((size) => ({ value: String(size), label: `${size} spaces` }));

/**
 * Every control here drives the real Monaco instance. "Inline comments" used
 * to sit under Collaboration but there is no comments API, so it went rather
 * than pretending to toggle something.
 */
export const EditorSection = memo(() => {
  const editor = useEditorPreferences();
  const collaboration = useCollaborationPreferences();

  const onFontFamilyChange = useCallback((value: string) => {
    preferencesStore.setEditor({ fontFamily: value as EditorFontPreference });
  }, []);

  const onFontSizeChange = useCallback((value: string) => {
    preferencesStore.setEditor({ fontSize: Number(value) });
  }, []);

  const onTabSizeChange = useCallback((value: string) => {
    preferencesStore.setEditor({ tabSize: Number(value) });
  }, []);

  const onToggleWordWrap = useCallback(() => {
    preferencesStore.setEditor({ wordWrap: !editor.wordWrap });
  }, [editor.wordWrap]);

  const onToggleMinimap = useCallback(() => {
    preferencesStore.setEditor({ minimap: !editor.minimap });
  }, [editor.minimap]);

  const onToggleLigatures = useCallback(() => {
    preferencesStore.setEditor({ ligatures: !editor.ligatures });
  }, [editor.ligatures]);

  const onToggleLiveCursors = useCallback(() => {
    preferencesStore.setCollaboration({ liveCursors: !collaboration.liveCursors });
  }, [collaboration.liveCursors]);

  const onToggleCursorLabels = useCallback(() => {
    preferencesStore.setCollaboration({ cursorLabels: !collaboration.cursorLabels });
  }, [collaboration.cursorLabels]);

  return (
    <>
      <div className={cls.section}>
        <div className={cls.secHead}>
          <span className={cls.secTitle}>Editor preferences</span>
          <span className={cls.secHint}>Saved on this device</span>
        </div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Font family</div></div>
            <div className={cls.rowControl}>
              <Select
                className={cls.control}
                value={editor.fontFamily}
                onChange={onFontFamilyChange}
                options={FONT_OPTIONS}
              />
            </div>
          </div>

          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Font size</div></div>
            <div className={cls.rowControl}>
              <Select
                className={cls.control}
                value={String(editor.fontSize)}
                onChange={onFontSizeChange}
                options={FONT_SIZE_OPTIONS}
              />
            </div>
          </div>

          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Tab size</div></div>
            <div className={cls.rowControl}>
              <Select
                className={cls.control}
                value={String(editor.tabSize)}
                onChange={onTabSizeChange}
                options={TAB_SIZE_OPTIONS}
              />
            </div>
          </div>

          <div className={cls.row}>
            <div className={cls.rowLabel}>
              <div className={cls.rowTitle}>Word wrap</div>
              <div className={cls.rowDesc}>Wrap long lines instead of scrolling sideways.</div>
            </div>
            <div className={cls.rowControl}>
              <Toggle checked={editor.wordWrap} onChange={onToggleWordWrap} aria-label="Word wrap" />
            </div>
          </div>

          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Minimap</div></div>
            <div className={cls.rowControl}>
              <Toggle checked={editor.minimap} onChange={onToggleMinimap} aria-label="Minimap" />
            </div>
          </div>

          <div className={cls.row}>
            <div className={cls.rowLabel}>
              <div className={cls.rowTitle}>Ligatures</div>
              <div className={cls.rowDesc}>Display programming ligatures when the font has them.</div>
            </div>
            <div className={cls.rowControl}>
              <Toggle checked={editor.ligatures} onChange={onToggleLigatures} aria-label="Ligatures" />
            </div>
          </div>
        </div>
      </div>

      <div className={cls.section}>
        <div className={cls.secHead}>
          <span className={cls.secTitle}>Collaboration</span>
          <span className={cls.secHint}>Saved on this device</span>
        </div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}>
              <div className={cls.rowTitle}>Show live cursors</div>
              <div className={cls.rowDesc}>Display collaborator carets and selections as they type.</div>
            </div>
            <div className={cls.rowControl}>
              <Toggle
                checked={collaboration.liveCursors}
                onChange={onToggleLiveCursors}
                aria-label="Show live cursors"
              />
            </div>
          </div>

          <div className={cls.row}>
            <div className={cls.rowLabel}>
              <div className={cls.rowTitle}>Cursor labels</div>
              <div className={cls.rowDesc}>Show a name badge on each collaborator&apos;s caret.</div>
            </div>
            <div className={cls.rowControl}>
              <Toggle
                checked={collaboration.cursorLabels}
                onChange={onToggleCursorLabels}
                disabled={!collaboration.liveCursors}
                aria-label="Cursor labels"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
