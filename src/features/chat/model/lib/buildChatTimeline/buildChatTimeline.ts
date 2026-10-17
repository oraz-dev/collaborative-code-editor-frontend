import type { ChatMessageView } from '../../types/chatMessage';

export interface ChatDayItem {
  kind: 'day';
  key: string;
  label: string;
}

/** Consecutive messages from one person, drawn as one run of bubbles. */
export interface ChatGroupItem {
  kind: 'group';
  /** The first message's id, so a run keeps its identity as it grows. */
  key: string;
  userId: string;
  mine: boolean;
  messages: ChatMessageView[];
}

export type ChatTimelineItem = ChatDayItem | ChatGroupItem;

/** A run breaks after this long a pause, even from the same person. */
const GROUP_GAP_MS = 5 * 60 * 1000;

function parse(createdAt: string): Date | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatMessageTime(createdAt: string): string {
  const date = parse(createdAt);
  return date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}

export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: days < 7 ? 'long' : undefined,
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Lays messages out the way a messenger does: a label for each new day, and
 * runs of bubbles from the same person. A message still sending has no server
 * time yet, so it joins whatever day and run it lands after.
 */
export function buildChatTimeline(
  messages: readonly ChatMessageView[],
  selfUserId: string | null,
  now: Date = new Date(),
): ChatTimelineItem[] {
  const items: ChatTimelineItem[] = [];
  let currentDay: string | null = null;
  let group: ChatGroupItem | null = null;
  let lastTime: Date | null = null;

  messages.forEach((message) => {
    const time = parse(message.createdAt);

    if (time) {
      const key = dayKey(time);
      if (key !== currentDay) {
        currentDay = key;
        items.push({ kind: 'day', key: `day-${key}`, label: formatDayLabel(time, now) });
        group = null;
      }
    }

    const pause = time && lastTime ? time.getTime() - lastTime.getTime() : 0;
    if (!group || group.userId !== message.userId || pause > GROUP_GAP_MS) {
      group = {
        kind: 'group',
        key: message.clientMsgId,
        userId: message.userId,
        mine: Boolean(selfUserId) && message.userId === selfUserId,
        messages: [],
      };
      items.push(group);
    }
    group.messages.push(message);
    if (time) lastTime = time;
  });

  return items;
}
