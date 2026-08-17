import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { useIsPhone } from '@/shared/lib/media/useMediaQuery';
import { WorkspaceSwitcher } from '@/widgets/WorkspaceSwitcher/WorkspaceSwitcher';
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
  const isPhone = useIsPhone();

  return (
    <div className={cls.root}>
      <WorkspaceSwitcher />
      <div className={cls.div} />
      {onCmdk && (
        <button type="button" className={cls.cmdPill} onClick={onCmdk} aria-label="Search projects">
          <Icons.Search size={15} />
          <span className={cls.sp}>Search projects…</span>
          {/* No keyboard, no shortcut worth advertising. */}
          {!isPhone && <Kbd keys={['⌘', 'K']} />}
        </button>
      )}
      <div className={cls.sp} />
      <div className={cls.right}>
        {showNew && <Button variant="primary" size="small" icon="plus" onClick={onNew}>New project</Button>}
        <AccountMenu />
      </div>
    </div>
  );
});
