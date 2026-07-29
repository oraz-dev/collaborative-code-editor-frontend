import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Button } from '@/shared/ui/Button/Button';
import { Toggle } from '@/shared/ui/Toggle/Toggle';
import { ACCOUNT } from '@/shared/data/demo';
import { AppBar } from '@/widgets/AppBar/AppBar';
import cls from './ProfilePage.module.scss';
import { useNavigate } from 'react-router';
import { initials } from '@/shared/lib/initials/initials';
import { useSession } from '@/features/auth';

// interface ProfilePageProps {
//   className?: string;
// }

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
            <div className={cls.avatarUpload}>
              <Avatar size="xl" initials={initials(displayName || 'Unknown')} color="var(--presence-1)" />
              <div className={cls.avatarOverlay}><Icons.Upload size={18} /></div>
            </div>
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
          <div className={cls.section}>
            <div className={cls.secHead}><span className={cls.secTitle}>Presence</span></div>
            <div className={cls.secBody}>
              <div className={cls.row}>
                <div className={cls.rowLabel}>
                  <div className={cls.rowTitle}>Show online status</div>
                  <div className={cls.rowDesc}>Let teammates see when you&apos;re active.</div>
                </div>
                <Toggle checked />
              </div>
              <div className={cls.row}>
                <div className={cls.rowLabel}>
                  <div className={cls.rowTitle}>Activity broadcasts</div>
                  <div className={cls.rowDesc}>Share which file you&apos;re editing.</div>
                </div>
                <Toggle checked />
              </div>
            </div>
          </div>
          <div className={cls.section}>
            <div className={cls.secHead}><span className={cls.secTitle}>Connected accounts</span></div>
            <div className={cls.secBody}>
              <div className={cls.row}>
                <Icons.GitHub size={18} />
                <div className={cls.rowLabel}><div className={cls.rowTitle}>GitHub</div><div className={cls.rowDesc}>@{ACCOUNT.name.toLowerCase().replace(' ', '')}</div></div>
                <Button variant="ghost" size="small">Disconnect</Button>
              </div>
              <div className={cls.row}>
                <Icons.Globe size={18} />
                <div className={cls.rowLabel}><div className={cls.rowTitle}>Google</div><div className={cls.rowDesc}>{ACCOUNT.email}</div></div>
                <Button variant="ghost" size="small">Disconnect</Button>
              </div>
            </div>
          </div>
          <div className={cls.dangerSection}>
            <div className={cls.secHead}><span className={cls.secTitle}>Danger zone</span></div>
            <div className={cls.secBody}>
              <div className={cls.row}>
                <div className={cls.rowLabel}>
                  <div className={cls.rowTitle}>Delete account</div>
                  <div className={cls.rowDesc}>Permanently remove your account and all data.</div>
                </div>
                <Button variant="destructive" size="small">Delete account</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
