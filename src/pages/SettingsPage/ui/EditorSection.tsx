import { memo } from 'react';
import { Toggle } from '@/shared/ui/Toggle/Toggle';
import cls from '../SettingsPage.module.scss';

export const EditorSection = memo(() => {
  return (
    <>
      <div className={cls.section}>
        <div className={cls.secHead}><span className={cls.secTitle}>Editor preferences</span></div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Font family</div></div>
            <select className={cls.fieldSelect} defaultValue="jetbrains" aria-label="Font family"><option value="jetbrains">JetBrains Mono</option><option value="fira">Fira Code</option><option value="sf">SF Mono</option></select>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Font size</div></div>
            <div className={cls.fieldInput}><input type="number" defaultValue="14" aria-label="Font size" /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Tab size</div></div>
            <div className={cls.fieldInput}><input type="number" defaultValue="2" aria-label="Tab size" /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Word wrap</div></div>
            <div className={cls.rowControl}><Toggle /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Minimap</div></div>
            <div className={cls.rowControl}><Toggle checked /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Ligatures</div><div className={cls.rowDesc}>Display programming ligatures when available.</div></div>
            <div className={cls.rowControl}><Toggle checked /></div>
          </div>
        </div>
      </div>
      <div className={cls.section}>
        <div className={cls.secHead}><span className={cls.secTitle}>Collaboration</span></div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Show live cursors</div><div className={cls.rowDesc}>Display collaborator cursors in real-time.</div></div>
            <div className={cls.rowControl}><Toggle checked /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Cursor labels</div><div className={cls.rowDesc}>Show name labels on collaborator cursors.</div></div>
            <div className={cls.rowControl}><Toggle checked /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Inline comments</div><div className={cls.rowDesc}>Show comment markers in the gutter.</div></div>
            <div className={cls.rowControl}><Toggle checked /></div>
          </div>
        </div>
      </div>
    </>
  );
});
