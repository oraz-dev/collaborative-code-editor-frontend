import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Badge } from '@/shared/ui/Badge/Badge';
import { Button } from '@/shared/ui/Button/Button';
import { initials } from '@/shared/lib/initials/initials';
import { MEMBERS, PENDING_INVITES, byId } from '@/shared/data/demo';
import cls from '../SettingsPage.module.scss';

export const TeamSection = memo(() => {
  return (
    <>
      <div className={cls.section}>
        <div className={cls.secHead}>
          <span className={cls.secTitle}>Members</span>
          <Badge variant="info" size="sm">{MEMBERS.length}</Badge>
          <span className={cls.flexSpacer} />
          <Button variant="primary" size="small"><Icons.Plus size={14} /> Invite</Button>
        </div>
        <div className={cls.secBody}>
          {MEMBERS.map(m => {
            const u = byId(m.id);
            const roleCls = m.role === 'owner' ? cls.roleOwner : m.role === 'admin' ? cls.roleAdmin : cls.roleMember;
            return (
              <div key={m.id} className={cls.memberRow}>
                <Avatar size="sm" initials={initials(u.name)} color={u.presence} />
                <div className={cls.memberInfo}>
                  <div className={cls.memberName}>{u.name}</div>
                  <div className={cls.memberEmail}>{m.email}</div>
                </div>
                <span className={classNames(cls.memberRole, {}, [roleCls])}>{m.role}</span>
              </div>
            );
          })}
        </div>
      </div>
      {PENDING_INVITES.length > 0 && (
        <div className={cls.section}>
          <div className={cls.secHead}>
            <span className={cls.secTitle}>Pending invites</span>
            <Badge variant="warning" size="sm">{PENDING_INVITES.length}</Badge>
          </div>
          <div className={cls.secBody}>
            {PENDING_INVITES.map(inv => (
              <div key={inv.email} className={cls.memberRow}>
                <Avatar size="sm" initials={inv.email[0].toUpperCase()} />
                <div className={cls.memberInfo}>
                  <div className={cls.memberEmail}>{inv.email}</div>
                </div>
                <span className={classNames(cls.memberRole, {}, [cls.rolePending])}>pending</span>
                <Button variant="ghost" size="small">Resend</Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
});
