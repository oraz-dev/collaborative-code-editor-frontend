import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { AppBar } from '@/widgets/AppBar/AppBar';
import cls from './ProfilePage.module.scss';
import { useNavigate } from 'react-router';
import { initials } from '@/shared/lib/initials/initials';
import { useSession } from '@/features/auth';

export const ProfilePage = memo(() => {
  const router = useNavigate();
  const { user } = useSession();

  // The auth service exposes no profile-update endpoint, so these fields show
  // the real account but are read-only rather than silently dropping edits.
  const displayName = user?.displayName ?? '';
  const email = user?.email ?? '';
  const username = user?.username ?? '';

  return (
    <div className={cls.canvas}>
      <AppBar />
      <div className={cls.body}>
        <div className={cls.wrap}>
          <div className={cls.back} onClick={() => router(-1)}><Icons.Arrow size={14} /> Back</div>
          <div className={cls.hero}>
            <Avatar size="xl" initials={initials(displayName || 'Unknown')} color="var(--presence-1)" />
            <div className={cls.heroTxt}>
              <div className={cls.heroName} data-testid="profile-name">{displayName}</div>
              <div className={cls.heroEmail}>{email}</div>
            </div>
          </div>
          <div className={cls.section}>
            <div className={cls.secHead}><span className={cls.secTitle}>Profile</span></div>
            <div className={cls.secBody}>
              <div className={cls.row}>
                <div className={cls.rowLabel}><div className={cls.rowTitle}>Display name</div></div>
                <div className={cls.fieldInput}><input value={displayName} readOnly aria-label="Display name" /></div>
              </div>
              <div className={cls.row}>
                <div className={cls.rowLabel}><div className={cls.rowTitle}>Email</div></div>
                <div className={cls.fieldInput}><input value={email} readOnly aria-label="Email" /></div>
              </div>
              <div className={cls.row}>
                <div className={cls.rowLabel}><div className={cls.rowTitle}>Username</div></div>
                <div className={cls.fieldInput}><input value={username} readOnly aria-label="Username" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
