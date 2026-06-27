import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { WorkspaceSwitcher } from '@/widgets/WorkspaceSwitcher/WorkspaceSwitcher';
import { NotificationPopover } from '@/widgets/NotificationPopover/NotificationPopover';
import { AccountMenu } from '@/widgets/AccountMenu/AccountMenu';
import cls from './AppBar.module.scss';

interface AppBarProps {
  className?: string;
  onCmdk?: () => void;
  showNew?: boolean;
  onNew?: () => void;
}

export const AppBar = memo((props: AppBarProps) => {
  const { onCmdk, showNew, onNew } = props;

  return (
    <div className={cls.root}>
      <WorkspaceSwitcher />
      <div className={cls.div} />
      <div className={cls.cmdPill} onClick={onCmdk}>
        <Icons.Search size={15} />
        <span className={cls.sp}>Search projects…</span>
        <Kbd keys={['⌘', 'K']} />
      </div>
      <div className={cls.sp} />
      <div className={cls.right}>
        {showNew && <Button variant="primary" size="small" icon="plus" onClick={onNew}>New project</Button>}
        <NotificationPopover />
        <AccountMenu />
      </div>
    </div>
  );
});
