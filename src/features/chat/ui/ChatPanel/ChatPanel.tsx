import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { initials } from '@/shared/lib/initials/initials';
import { Icons } from '@/shared/ui/Icon/Icons';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { presenceColorFor, type ConnectionStatus, type PresencePeer } from '@/features/collaboration';
import { useUsersByIds } from '@/entities/User';
import { accentById } from '../../model/consts/chatSkins';
import { chatAppearanceStore } from '../../model/chatAppearance/chatAppearanceStore';
import { useChatAppearance } from '../../model/chatAppearance/useChatAppearance';
import { buildChatTimeline } from '../../model/lib/buildChatTimeline/buildChatTimeline';
import { useDismiss } from '../../model/lib/useDismiss/useDismiss';
import type { ChatMessageView } from '../../model/types/chatMessage';
import { ChatDayDivider, ChatMessageGroup } from '../ChatMessageGroup/ChatMessageGroup';
import { ChatThemePicker } from '../ChatThemePicker/ChatThemePicker';
import { EmojiPicker } from '../EmojiPicker/EmojiPicker';
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

/** How close to the bottom still counts as "reading the latest". */
const PINNED_SLACK_PX = 80;
const GLIDE_MS = 280;
const EMPTY_IDS: ReadonlySet<string> = new Set();

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_SLACK_PX;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface ChatFeedProps {
  messages: ChatMessageView[];
  selfUserId: string | null;
  nameFor: (userId: string) => string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetry: (clientMsgId: string) => void;
}

/**
 * The scrolling conversation. Messages sit at the bottom and the thread grows
 * upward: a new one rises in while everything above glides up by its height.
 * Mounted only once there is something to show, so its scroll bookkeeping
 * starts fresh with each document.
 */
const ChatFeed = memo((props: ChatFeedProps) => {
  const { messages, selfUserId, nameFor, hasMore, isLoadingMore, onLoadMore, onRetry } = props;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevRef = useRef<{ firstId?: string; lastId?: string; height: number; scrollHeight: number }>({
    height: 0,
    scrollHeight: 0,
  });

  // History renders still; only messages that arrive after it animate in.
  const [lastAtMount] = useState(() => messages[messages.length - 1]?.clientMsgId);
  const [atBottom, setAtBottom] = useState(true);
  const [seenLastId, setSeenLastId] = useState(() => messages[messages.length - 1]?.clientMsgId);

  const timeline = useMemo(() => buildChatTimeline(messages, selfUserId), [messages, selfUserId]);

  const freshIds = useMemo(() => {
    const mountIndex = messages.findIndex((message) => message.clientMsgId === lastAtMount);
    if (mountIndex < 0) return EMPTY_IDS;
    return new Set(messages.slice(mountIndex + 1).map((message) => message.clientMsgId));
  }, [messages, lastAtMount]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const feed = feedRef.current;
    if (!scroller || !feed) return;

    const prev = prevRef.current;
    const first = messages[0];
    const last = messages[messages.length - 1];
    const height = feed.offsetHeight;
    const isFirstLayout = prev.lastId === undefined;
    const appended = last?.clientMsgId !== prev.lastId;
    const prepended = !appended && first?.clientMsgId !== prev.firstId;

    if (prepended) {
      // Older history landed above: keep the reader where they were.
      scroller.scrollTop += scroller.scrollHeight - prev.scrollHeight;
    } else if (appended) {
      const own = Boolean(selfUserId) && last?.userId === selfUserId;
      if (isFirstLayout || atBottomRef.current || own) {
        scroller.scrollTop = scroller.scrollHeight;
        const grew = height - prev.height;
        if (!isFirstLayout && grew > 0 && typeof feed.animate === 'function' && !prefersReducedMotion()) {
          feed.animate(
            [{ transform: `translateY(${grew}px)` }, { transform: 'translateY(0)' }],
            { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          );
        }
      }
    }

    prevRef.current = { firstId: first?.clientMsgId, lastId: last?.clientMsgId, height, scrollHeight: scroller.scrollHeight };
  }, [messages, selfUserId]);

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const near = isNearBottom(scroller);
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setSeenLastId(messages[messages.length - 1]?.clientMsgId);
  }, [messages]);

  const onJump = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const missed = useMemo(() => {
    if (atBottom) return 0;
    const seenIndex = messages.findIndex((message) => message.clientMsgId === seenLastId);
    if (seenIndex < 0) return 0;
    return messages.slice(seenIndex + 1).filter((message) => message.userId !== selfUserId).length;
  }, [atBottom, messages, seenLastId, selfUserId]);

  return (
    <div className={cls.feedWrap}>
      <div className={cls.scroller} ref={scrollerRef} onScroll={onScroll} data-chat-wall="">
        <div
          className={cls.feed}
          ref={feedRef}
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

          {timeline.map((item) => {
            if (item.kind === 'day') return <ChatDayDivider key={item.key} label={item.label} />;
            const name = nameFor(item.userId);
            return (
              <ChatMessageGroup
                key={item.key}
                mine={item.mine}
                messages={item.messages}
                authorName={name}
                authorInitials={initials(name)}
                authorColor={presenceColorFor(item.userId)}
                onRetry={onRetry}
                freshIds={freshIds}
              />
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className={classNames(cls.jump, { [cls.jumpHidden]: atBottom })}
        onClick={onJump}
        aria-label={missed > 0 ? `Jump to latest messages, ${missed} new` : 'Jump to latest messages'}
        tabIndex={atBottom ? -1 : 0}
        data-testid="chat-jump"
      >
        <Icons.ChevD size={18} />
        {missed > 0 && <span className={cls.jumpCount}>{missed}</span>}
      </button>
    </div>
  );
});

/**
 * The document's chat.
 *
 * Every collaborator shares one conversation per document — the same people
 * the document is shared with, viewers included. Messages are live over the
 * collaboration socket; the history above them is paged in on demand. How it
 * looks (one of twenty themes) is each viewer's own choice.
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

  const appearance = useChatAppearance();
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const themePickerRef = useRef<HTMLDivElement>(null);
  // Where the caret goes once an inserted emoji has rendered.
  const caretRef = useRef<number | null>(null);

  const emojiRefs = useMemo(() => [emojiButtonRef, emojiPickerRef], []);
  const themeRefs = useMemo(() => [themeButtonRef, themePickerRef], []);
  const closeEmoji = useCallback(() => setEmojiOpen(false), []);
  const closeThemes = useCallback(() => setThemesOpen(false), []);
  useDismiss(emojiOpen, closeEmoji, emojiRefs);
  useDismiss(themesOpen, closeThemes, themeRefs);

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

  // One avatar per person, however many tabs they have open.
  const online = useMemo(() => {
    const byUser = new Map<string, { id: string; name: string; presence: string }>();
    peers.forEach((peer) => {
      if (!byUser.has(peer.userId)) {
        byUser.set(peer.userId, { id: peer.userId, name: peer.isSelf ? 'You' : peer.name, presence: peer.color });
      }
    });
    return Array.from(byUser.values());
  }, [peers]);

  // Grow the composer with its contents, up to the max height the stylesheet caps.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (caretRef.current !== null) {
      el.focus();
      el.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [draft]);

  const submit = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
  }, [draft, onSend]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter is a newline, as every chat does it. Not mid-IME.
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const onPickEmoji = useCallback((emoji: string) => {
    const el = composerRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? start;
    caretRef.current = start + emoji.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    chatAppearanceStore.rememberEmoji(emoji);
  }, [draft]);

  const onToggleEmoji = useCallback(() => {
    setThemesOpen(false);
    setEmojiOpen((open) => !open);
  }, []);

  const onToggleThemes = useCallback(() => {
    setEmojiOpen(false);
    setThemesOpen((open) => !open);
  }, []);

  const accent = accentById(appearance.accent);
  const paneStyle = {
    ...style,
    '--chat-accent': accent.color,
    '--chat-on-accent': accent.onColor,
  } as CSSProperties;

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className={cls.state} data-chat-wall="">
          <Spinner size="large" label="Loading chat" />
        </div>
      );
    }

    if (error && messages.length === 0) {
      return (
        <div className={cls.state} data-chat-wall="" data-testid="chat-error">
          <p>We couldn&apos;t load this conversation.</p>
          <span className={cls.hint}>Check your connection, then close and reopen the chat.</span>
        </div>
      );
    }

    if (messages.length === 0) {
      return (
        <div className={cls.state} data-chat-wall="" data-testid="chat-empty">
          <span className={cls.wave} aria-hidden="true">👋</span>
          <p>No messages yet</p>
          <span className={cls.hint}>Say hello to everyone on this document.</span>
        </div>
      );
    }

    return (
      <ChatFeed
        messages={messages}
        selfUserId={selfUserId}
        nameFor={nameFor}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
      />
    );
  };

  return (
    <section
      className={classNames(cls.pane, {}, [className])}
      style={paneStyle}
      aria-label="Document chat"
    >
      <header className={cls.bar}>
        {online.length > 0 && <AvatarStack people={online} max={3} size="sm" className={cls.people} />}
        <div className={cls.heading}>
          <span className={cls.title}>Chat</span>
          {status === 'connected' ? (
            <span className={cls.sub}>
              <span className={cls.liveDot} aria-hidden="true" />
              {online.length} online
            </span>
          ) : (
            <span className={cls.sub} title="Reconnecting — messages will send when you are back">
              Reconnecting…
            </span>
          )}
        </div>
        <button
          ref={themeButtonRef}
          type="button"
          className={classNames(cls.barBtn, { [cls.barBtnActive]: themesOpen })}
          onClick={onToggleThemes}
          aria-label="Chat theme"
          aria-expanded={themesOpen}
          data-testid="chat-theme-toggle"
        >
          <Icons.Palette size={16} />
        </button>
        <IconButton size="sm" onClick={onClose} aria-label="Close chat">
          <Icons.X size={16} />
        </IconButton>
      </header>

      {themesOpen && (
        <div className={cls.themePopover}>
          <ChatThemePicker
            ref={themePickerRef}
            skin={appearance.skin}
            accent={appearance.accent}
            onSkinChange={chatAppearanceStore.setSkin}
            onAccentChange={chatAppearanceStore.setAccent}
          />
        </div>
      )}

      {/* The theme covers the conversation only, never the pickers: a preview
          nested under the active skin would inherit its styles. */}
      <div className={cls.body} data-skin={appearance.skin} data-testid="chat-body">
        {renderBody()}
      </div>

      <div className={cls.composer}>
        {emojiOpen && (
          <div className={cls.emojiPopover}>
            <EmojiPicker ref={emojiPickerRef} recent={appearance.recentEmojis} onPick={onPickEmoji} />
          </div>
        )}

        <div className={cls.row}>
          <div className={cls.field}>
            <button
              ref={emojiButtonRef}
              type="button"
              className={cls.emojiBtn}
              onClick={onToggleEmoji}
              aria-label="Insert emoji"
              aria-expanded={emojiOpen}
              data-testid="chat-emoji-toggle"
            >
              <Icons.Smile size={20} />
            </button>
            <textarea
              ref={composerRef}
              className={cls.input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message"
              rows={1}
              aria-label="Write a message"
              data-testid="chat-input"
            />
          </div>
          <button
            type="button"
            className={cls.send}
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="Send message"
            data-testid="chat-send"
          >
            <Icons.Send size={17} />
          </button>
        </div>
      </div>
    </section>
  );
});
