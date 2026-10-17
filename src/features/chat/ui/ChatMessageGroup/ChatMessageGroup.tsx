import { Fragment, memo, type CSSProperties } from 'react';
import '@fontsource/bangers/400.css';
import '@fontsource/caveat/600.css';
import '@fontsource/special-elite/400.css';
import '@fontsource/vt323/400.css';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Icons } from '@/shared/ui/Icon/Icons';
import { formatMessageTime } from '../../model/lib/buildChatTimeline/buildChatTimeline';
import { isEmojiOnly } from '../../model/lib/isEmojiOnly/isEmojiOnly';
import type { ChatMessageView } from '../../model/types/chatMessage';
import cls from './ChatMessageGroup.module.scss';

interface ChatMessageGroupProps {
  className?: string;
  /** The viewer's own run: right-aligned, no avatar or name. */
  mine: boolean;
  messages: readonly ChatMessageView[];
  authorName: string;
  authorInitials: string;
  /** The author's presence colour, for their avatar and name. */
  authorColor: string;
  onRetry?: (clientMsgId: string) => void;
  /** Messages that arrived while the chat was open, which rise in as they mount. */
  freshIds?: ReadonlySet<string>;
}

/** A run of consecutive messages from one person. */
export const ChatMessageGroup = memo((props: ChatMessageGroupProps) => {
  const { className, mine, messages, authorName, authorInitials, authorColor, onRetry, freshIds } = props;

  return (
    <div
      className={classNames(cls.group, { [cls.mine]: mine, [cls.theirs]: !mine }, [className])}
      style={{ '--chat-author': authorColor } as CSSProperties}
      data-testid="chat-group"
    >
      {!mine && <Avatar size="sm" className={cls.avatar} initials={authorInitials} color={authorColor} />}

      <div className={cls.bubbles}>
        {messages.map((message, index) => {
          const jumbo = isEmojiOnly(message.body);
          const failed = message.status === 'failed';
          const showName = !mine && index === 0 && !jumbo;
          const time = formatMessageTime(message.createdAt);

          return (
            <Fragment key={message.clientMsgId}>
              <div
                className={classNames(cls.bubble, {
                  [cls.jumbo]: jumbo,
                  [cls.failed]: failed,
                  [cls.enter]: freshIds?.has(message.clientMsgId),
                })}
                data-testid="chat-message"
              >
                <span className={classNames(cls.deco, {}, [cls.d1])} aria-hidden="true" />
                <span className={classNames(cls.deco, {}, [cls.d2])} aria-hidden="true" />
                <span className={classNames(cls.deco, {}, [cls.d3])} aria-hidden="true" />
                {showName ? (
                  <span className={cls.name}>{authorName}</span>
                ) : (
                  <span className={cls.srOnly}>{authorName}: </span>
                )}
                {message.body}
                <span className={cls.meta}>
                  {time}
                  {mine && message.status === 'sending' && <Icons.Clock size={12} aria-label="Sending" />}
                  {mine && message.status === 'sent' && <Icons.Check size={12} aria-label="Sent" />}
                </span>
              </div>
              {failed && onRetry && (
                <button
                  type="button"
                  className={cls.retry}
                  onClick={() => onRetry(message.clientMsgId)}
                  aria-label="Retry sending this message"
                >
                  <Icons.Retry size={12} /> Not sent · Retry
                </button>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
});

interface ChatDayDividerProps {
  className?: string;
  label: string;
}

/** "Today", "Yesterday"… — sticks to the top while its day scrolls past. */
export const ChatDayDivider = memo(({ className, label }: ChatDayDividerProps) => (
  <div className={classNames(cls.day, {}, [className])} role="separator" aria-label={label}>
    {label}
  </div>
));
