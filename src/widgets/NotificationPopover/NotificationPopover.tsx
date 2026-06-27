import { useState, useCallback, memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Badge } from '@/shared/ui/Badge/Badge';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { byId, NOTIFICATIONS } from '@/shared/data/demo';
import cls from './NotificationPopover.module.scss';

function ini(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

interface NotificationPopoverProps {
  className?: string;
}

export const NotificationPopover = memo((_props: NotificationPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(NOTIFICATIONS);
  const unread = items.filter(n => n.unread).length;

  const handleToggle = useCallback(() => {
    setOpen(o => !o);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const markAll = useCallback(() => {
    setItems(arr => arr.map(n => ({ ...n, unread: false })));
  }, []);

  const markRead = useCallback((index: number) => {
    setItems(arr => arr.map((x, j) => j === index ? { ...x, unread: false } : x));
  }, []);

  return (
    <div className={cls.root}>
      <span className={cls.bellWrap}>
        <IconButton aria-label="Notifications" active={open} onClick={handleToggle}>
          <Icons.Bell size={18} />
        </IconButton>
        {unread > 0 && <span className={cls.dot} />}
      </span>
      {open && (
        <>
          <div className={cls.scrim} onClick={handleClose} />
          <div className={cls.pop}>
            <div className={cls.popHead}>
              <span className={cls.popTitle}>Notifications</span>
              {unread > 0 && <Badge variant="info" size="sm">{unread} new</Badge>}
              <span className={cls.popSp} />
              <span className={cls.popAction} onClick={markAll}>Mark all read</span>
            </div>
            <div className={cls.list}>
              {items.map((n, i) => {
                const who = byId(n.who);
                const Ico = (Icons as Record<string, typeof Icons.Bell>)[n.icon] || Icons.Bell;
                return (
                  <div
                    className={cls.notif}
                    key={i}
                    data-unread={n.unread}
                    onClick={() => markRead(i)}
                  >
                    <span className={cls.ava}>
                      <Avatar size="sm" initials={ini(who.name)} color={who.you ? undefined : who.presence} />
                      <span className={cls.badge}><Ico size={9} /></span>
                    </span>
                    <div className={cls.txt}>
                      <b>{who.short}</b> {n.text} <span className={cls.tgt}>{n.target}</span>
                    </div>
                    <span className={cls.time}>{n.time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
