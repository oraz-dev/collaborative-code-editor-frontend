import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { presenceColorFor, type ConnectionStatus, type PresencePeer } from '@/features/collaboration';
import { useUsersByIds } from '@/entities/User';
import type { ChatMessageView } from '../../model/types/chatMessage';
import cls from './ChatPanel.module.scss';

interface ChatPanelProps {
  className?: string;
  /** Set by the resizable layout in EditorPage. */
  style?: CSSProperties;
  messages: ChatMessageView[];
  /** The signed-in user, so their own messages read as "You" and align right. */
  selfUserId: string | null;
  /** Everyone currently in the room — their names and colours without a lookup. */
  peers: PresencePeer[];
  status: ConnectionStatus;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSend: (body: string) => void;
  onRetry: (clientMsgId: string) => void;
  onClose: () => void;
}

/** Initials for the avatar of someone with no picture. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

function formatTime(createdAt: string): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** True once the scroll position is within a screen's reach of the bottom. */
function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight;
}

/**
 * The document's chat.
 *
 * Every collaborator shares one conversation per document — the same people
 * the document is shared with, viewers included. Messages are live over the
 * collaboration socket; the history above them is paged in on demand.
 */
export const ChatPanel = memo((props: ChatPanelProps) => {
  const {
    className,
    style,
    messages,
    selfUserId,
    peers,
    status,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onSend,
    onRetry,
    onClose,
  } = props;

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Whether the viewer is pinned to the bottom, so an incoming message scrolls
  // into view only when they were already reading the latest.
  const pinnedRef = useRef(true);

  const peerNameById = useMemo(() => {
    const map = new Map<string, string>();
    peers.forEach((peer) => map.set(peer.userId, peer.name));
    return map;
  }, [peers]);

  // People who have spoken but are not in the room now, so a uuid is all the
  // message carries — resolved to a name through the profile lookup.
  const unknownIds = useMemo(() => {
    const ids = new Set<string>();
    messages.forEach((message) => {
      if (message.userId && message.userId !== selfUserId && !peerNameById.has(message.userId)) {
        ids.add(message.userId);
      }
    });
    return Array.from(ids);
  }, [messages, peerNameById, selfUserId]);

  const usersQuery = useUsersByIds(unknownIds, unknownIds.length > 0);
  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    (usersQuery.data ?? []).forEach((user) => map.set(user.id, user.displayName));
    return map;
  }, [usersQuery.data]);

  const nameFor = useCallback(
    (userId: string): string => {
      if (userId && userId === selfUserId) return 'You';
      return peerNameById.get(userId) ?? profileNameById.get(userId) ?? 'Collaborator';
    },
    [peerNameById, profileNameById, selfUserId],
  );

  // Keep the newest message in view, but only when the reader had not scrolled
  // up to read older ones.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (el) pinnedRef.current = isNearBottom(el);
  }, []);

  // Grow the composer with its contents, up to the max height the stylesheet caps.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const submit = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
    pinnedRef.current = true;
  }, [draft, onSend]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter is a newline, as every chat does it.
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className={cls.state}>
          <Spinner size="large" label="Loading chat" />
        </div>
      );
    }

    if (error && messages.length === 0) {
      return (
        <div className={cls.state} data-testid="chat-error">
          <p>We couldn&apos;t load this conversation.</p>
        </div>
      );
    }

    if (messages.length === 0) {
      return (
        <div className={cls.state} data-testid="chat-empty">
          <Icons.Comment size={24} />
          <p>No messages yet.</p>
          <span className={cls.hint}>Say hello to everyone on this document.</span>
        </div>
      );
    }

    return (
      <div
        className={cls.list}
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        data-testid="chat-list"
      >
        {hasMore && (
          <div className={cls.older}>
            <button
              type="button"
              className={cls.olderBtn}
              onClick={onLoadMore}
              disabled={isLoadingMore}
              aria-label="Load older messages"
            >
              {isLoadingMore ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.map((message, index) => {
          const self = Boolean(selfUserId) && message.userId === selfUserId;
          const previous = messages[index - 1];
          // Start a fresh author block when the speaker changes.
          const startsGroup = !previous || previous.userId !== message.userId;
          const name = nameFor(message.userId);
          const time = formatTime(message.createdAt);

          return (
            <div
              key={message.clientMsgId}
              className={classNames(cls.row, {
                [cls.self]: self,
                [cls.grouped]: !startsGroup,
              })}
              data-testid="chat-message"
            >
              {startsGroup ? (
                <Avatar
                  size="sm"
                  className={cls.avatar}
                  initials={initialsOf(name)}
                  color={presenceColorFor(message.userId)}
                />
              ) : (
                <span className={cls.avatarSpacer} aria-hidden="true" />
              )}

              <div className={cls.bubbleWrap}>
                {startsGroup && (
                  <div className={cls.meta}>
                    <span className={cls.author}>{name}</span>
                    {time && <span className={cls.time}>{time}</span>}
                  </div>
                )}
                <div className={classNames(cls.bubble, { [cls.failed]: message.status === 'failed' })}>
                  {message.body}
                </div>
                {message.status === 'sending' && <span className={cls.status}>Sending…</span>}
                {message.status === 'failed' && (
                  <button
                    type="button"
                    className={cls.retry}
                    onClick={() => onRetry(message.clientMsgId)}
                    aria-label="Retry sending this message"
                  >
                    <Icons.Retry size={11} /> Not sent — retry
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section
      className={classNames(cls.pane, {}, [className])}
      style={style}
      aria-label="Document chat"
    >
      <header className={cls.bar}>
        <Icons.Comment size={14} />
        <span className={cls.title}>Chat</span>
        {status !== 'connected' && (
          <span className={cls.offline} title="Reconnecting — messages will send when you are back">
            offline
          </span>
        )}
        <span className={cls.spacer} />
        <IconButton size="sm" onClick={onClose} aria-label="Close chat">
          <Icons.X size={16} />
        </IconButton>
      </header>

      {renderBody()}

      <div className={cls.composer}>
        <textarea
          ref={composerRef}
          className={cls.input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message everyone on this document…"
          rows={1}
          aria-label="Write a message"
          data-testid="chat-input"
        />
        <IconButton
          size="sm"
          variant="solid"
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Send message"
          data-testid="chat-send"
        >
          <Icons.Send size={16} />
        </IconButton>
      </div>
    </section>
  );
});
