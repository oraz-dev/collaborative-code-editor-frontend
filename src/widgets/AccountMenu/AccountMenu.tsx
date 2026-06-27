import { useState, useCallback, memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { ACCOUNT } from '@/shared/data/demo';
import cls from './AccountMenu.module.scss';
import { useNavigate } from 'react-router';
import { RoutePaths } from '@/shared/config/routeConfig/routeConfig';

function ini(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export const AccountMenu = memo(() => {
  const [open, setOpen] = useState(false);
  const router = useNavigate();

  const handleToggle = useCallback(() => {
    setOpen(o => !o);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleAction = useCallback((action: string) => {
    setOpen(false);
    router(action);
  }, []);

  return (
    <div className={cls.root}>
      <button className={cls.btn} onClick={handleToggle} aria-label="Account">
        <Avatar size="sm" initials={ini(ACCOUNT.name)} color={ACCOUNT.presence} />
        <span className={cls.chev}><Icons.ChevSel size={14} /></span>
      </button>
      {open && (
        <>
          <div className={cls.scrim} onClick={handleClose} />
          <div className={cls.menu}>
            <div className={cls.head}>
              <Avatar size="md" initials={ini(ACCOUNT.name)} color={ACCOUNT.presence} />
              <div>
                <div className={cls.headName}>{ACCOUNT.name}</div>
                <div className={cls.headSub}>{ACCOUNT.email}</div>
              </div>
            </div>
            <div className={cls.div} />
            <div className={cls.item} onClick={() => handleAction(RoutePaths.main)}>
              <span className={cls.ico}><Icons.Grid size={16} /></span>Dashboard
            </div>
            <div className={cls.item} onClick={() => handleAction(RoutePaths.profile)}>
              <span className={cls.ico}><Icons.User size={16} /></span>Profile
            </div>
            <div className={cls.item} onClick={() => handleAction(RoutePaths.settings)}>
              <span className={cls.ico}><Icons.Settings size={16} /></span>Settings
              <span className={cls.kbd}><Kbd keys={['⌘', ',']} /></span>
            </div>
            <div className={cls.item} onClick={() => handleAction(RoutePaths.upgrade)}>
              <span className={cls.ico}><Icons.Bolt size={16} /></span>Upgrade plan
            </div>
            <div className={cls.div} />
            <div className={classNames(cls.item, {}, [cls.danger])} onClick={() => handleAction(RoutePaths.auth)}>
              <span className={cls.ico}><Icons.LogOut size={16} /></span>Sign out
            </div>
          </div>
        </>
      )}
    </div>
  );
});
