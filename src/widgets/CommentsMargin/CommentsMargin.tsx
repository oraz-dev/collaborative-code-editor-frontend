import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { byId, type Comment } from '@/shared/data/demo';
import cls from './CommentsMargin.module.scss';

function ini(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

interface CommentsMarginProps {
  className?: string;
  comments: Comment[];
}

export const CommentsMargin = memo((props: CommentsMarginProps) => {
  const { comments } = props;

  if (!comments || comments.length === 0) {
    return (
      <div className={cls.root}>
        <div className={cls.head}>
          <span className={cls.title}>Comments</span>
        </div>
        <div className={cls.empty}>
          <Icons.Comment size={22} /><br />
          No comments on this file yet.<br />Click a line number to start a thread.
        </div>
      </div>
    );
  }

  return (
    <div className={cls.root}>
      <div className={cls.head}>
        <span className={cls.title}>Comments</span>
        <span className={cls.count}>{comments.length}</span>
        <span className={cls.headSp} />
        <IconButton size="sm" aria-label="Add comment"><Icons.Plus size={14} /></IconButton>
      </div>
      <div className={cls.scroll}>
        {comments.map(c => {
          const who = byId(c.who);
          return (
            <div key={c.id} className={cls.card}>
              <div
                className={cls.thread}
                style={{ '--thread-color': who.presence } as React.CSSProperties}
              />
              <div className={cls.line}><Icons.HashSym size={10} /> L{c.line}</div>
              <div className={cls.cardHead}>
                <Avatar size="sm" initials={ini(who.name)} color={who.presence} />
                <span className={cls.cardName}>{who.short}</span>
                <span className={cls.cardTime}>{c.time}</span>
              </div>
              <div className={cls.body}>{c.body}</div>
              <div className={cls.reply}>
                <Icons.Reply size={13} />
                <input placeholder="Reply…" aria-label="Reply to comment" />
                <IconButton size="sm" aria-label="Send reply"><Icons.Send size={13} /></IconButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
