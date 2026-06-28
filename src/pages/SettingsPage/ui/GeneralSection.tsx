import { memo } from 'react';
import { Toggle } from '@/shared/ui/Toggle/Toggle';
import { ACCOUNT } from '@/shared/data/demo';
import cls from '../SettingsPage.module.scss';

export const GeneralSection = memo(() => {
  return (
    <>
      <div className={cls.section}>
        <div className={cls.secHead}><span className={cls.secTitle}>Workspace</span></div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Workspace name</div></div>
            <div className={cls.fieldInput}><input defaultValue={ACCOUNT.workspace.name} aria-label="Workspace name" /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Workspace URL</div><div className={cls.rowDesc}>space.dev/{ACCOUNT.workspace.slug}</div></div>
            <div className={cls.fieldInput}><input defaultValue={ACCOUNT.workspace.slug} aria-label="Workspace URL" /></div>
          </div>
        </div>
      </div>
      <div className={cls.section}>
        <div className={cls.secHead}><span className={cls.secTitle}>Appearance</span></div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Theme</div><div className={cls.rowDesc}>Choose a color theme for the editor.</div></div>
            <select className={cls.fieldSelect} defaultValue="dark" aria-label="Theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Accent color</div></div>
            <select className={cls.fieldSelect} defaultValue="azure" aria-label="Accent color"><option value="azure">Azure</option><option value="violet">Violet</option><option value="mint">Mint</option><option value="coral">Coral</option></select>
          </div>
        </div>
      </div>
      <div className={cls.section}>
        <div className={cls.secHead}><span className={cls.secTitle}>Notifications</span></div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Desktop notifications</div><div className={cls.rowDesc}>Receive browser push notifications.</div></div>
            <div className={cls.rowControl}><Toggle checked /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Email digest</div><div className={cls.rowDesc}>Weekly summary of workspace activity.</div></div>
            <div className={cls.rowControl}><Toggle /></div>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Sound effects</div></div>
            <div className={cls.rowControl}><Toggle checked /></div>
          </div>
        </div>
      </div>
    </>
  );
});
