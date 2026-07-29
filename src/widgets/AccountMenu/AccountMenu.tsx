import { useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { initials } from '@/shared/lib/initials/initials';
import { RoutePaths } from '@/shared/config/routeConfig/routeConfig';
import { useLogout, useSession } from '@/features/auth';
import { presenceColorFor } from '@/features/collaboration';
import cls from './AccountMenu.module.scss';

export const AccountMenu = memo(() => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { user } = useSession();
  const { logout } = useLogout();

  const handleToggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const onSignOut = useCallback(() => {
    setOpen(false);
    // The local session is dropped either way, so a failed request still
    // signs the user out rather than stranding them half-in.
    logout.mutate(undefined, {
      onSettled: () => navigate(RoutePaths.auth, { replace: true }),
    });
  }, [logout, navigate]);

  const name = user?.displayName ?? 'Signed out';
  const email = user?.email ?? '';
  const color = user ? presenceColorFor(user.id) : 'var(--presence-1)';

  return (
    <div className={cls.root}>
      <button className={cls.btn} onClick={handleToggle} aria-label="Account" aria-expanded={open}>
        <Avatar size="sm" initials={initials(name)} color={color} />
        <span className={cls.chev}><Icons.ChevSel size={14} /></span>
      </button>

      {open && (
        <>
          <div className={cls.scrim} onClick={handleClose} />
          <div className={cls.menu}>
            <div className={cls.head}>
              <Avatar size="md" initials={initials(name)} color={color} />
              <div>
                <div className={cls.headName} data-testid="account-name">{name}</div>
                {email && <div className={cls.headSub}>{email}</div>}
              </div>
            </div>

            <div className={cls.div} />

            <div
              className={cls.item}
              onClick={() => handleNavigate(RoutePaths.main)}
              role="menuitem"
              tabIndex={0}
            >
              <span className={cls.ico}><Icons.Grid size={16} /></span>Dashboard
            </div>
            <div
              className={cls.item}
              onClick={() => handleNavigate(RoutePaths.profile)}
              role="menuitem"
              tabIndex={0}
            >
              <span className={cls.ico}><Icons.User size={16} /></span>Profile
            </div>
            <div
              className={cls.item}
              onClick={() => handleNavigate(RoutePaths.settings)}
              role="menuitem"
              tabIndex={0}
            >
              <span className={cls.ico}><Icons.Settings size={16} /></span>Settings
              <span className={cls.kbd}><Kbd keys={['⌘', ',']} /></span>
            </div>
            <div
              className={cls.item}
              onClick={() => handleNavigate(RoutePaths.upgrade)}
              role="menuitem"
              tabIndex={0}
            >
              <span className={cls.ico}><Icons.Bolt size={16} /></span>Upgrade plan
            </div>

            <div className={cls.div} />

            <div
              className={classNames(cls.item, {}, [cls.danger])}
              onClick={onSignOut}
              role="menuitem"
              tabIndex={0}
              aria-label="Sign out"
              data-testid="sign-out"
            >
              <span className={cls.ico}>
                {logout.isPending ? <Spinner /> : <Icons.LogOut size={16} />}
              </span>
              Sign out
            </div>
          </div>
        </>
      )}
    </div>
  );
});
