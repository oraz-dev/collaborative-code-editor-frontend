import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { ACCOUNT } from '@/shared/data/demo';
import cls from '../SettingsPage.module.scss';

interface BillingSectionProps {
  onUpgrade?: () => void;
}

export const BillingSection = memo((props: BillingSectionProps) => {
  const { onUpgrade } = props;

  return (
    <>
      <div className={cls.section}>
        <div className={cls.secHead}><span className={cls.secTitle}>Current plan</span></div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}>
              <div className={cls.rowTitle}>{ACCOUNT.plan} plan</div>
              <div className={cls.rowDesc}>{ACCOUNT.workspace.members} seats · 10 GB storage</div>
            </div>
            <Button variant="primary" size="small" onClick={onUpgrade}><Icons.Sparkle size={14} /> Upgrade</Button>
          </div>
        </div>
      </div>
      <div className={cls.section}>
        <div className={cls.secHead}><span className={cls.secTitle}>Usage</span></div>
        <div className={cls.secBody}>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>Storage used</div></div>
            <span className={cls.usageStat}>2.1 GB / 10 GB</span>
          </div>
          <div className={cls.row}>
            <div className={cls.rowLabel}><div className={cls.rowTitle}>API calls this month</div></div>
            <span className={cls.usageStat}>12,847 / 50,000</span>
          </div>
        </div>
      </div>
    </>
  );
});
