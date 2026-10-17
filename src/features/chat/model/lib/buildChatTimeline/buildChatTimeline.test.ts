import { describe, expect, test } from 'vitest';
import { buildChatTimeline, formatDayLabel, type ChatGroupItem } from './buildChatTimeline';
import type { ChatMessageView } from '../../types/chatMessage';

const NOW = new Date('2026-10-17T12:00:00');

function msg(clientMsgId: string, userId: string, createdAt: string): ChatMessageView {
  return { id: clientMsgId, clientMsgId, documentId: 'd', userId, body: 'x', createdAt, status: 'sent', localSeq: 0 };
}

describe('buildChatTimeline', () => {
  test('starts each day with a label and groups runs by author', () => {
    const items = buildChatTimeline(
      [
        msg('a', 'u1', '2026-10-16T21:40:00'),
        msg('b', 'u2', '2026-10-17T09:14:00'),
        msg('c', 'u2', '2026-10-17T09:15:00'),
        msg('d', 'me', '2026-10-17T09:16:00'),
      ],
      'me',
      NOW,
    );

    expect(items.map((item) => (item.kind === 'day' ? item.label : item.messages.map((m) => m.clientMsgId).join(''))))
      .toEqual(['Yesterday', 'a', 'Today', 'bc', 'd']);
    expect((items[4] as ChatGroupItem).mine).toBe(true);
  });

  test('a long pause starts a new run from the same person', () => {
    const items = buildChatTimeline(
      [msg('a', 'u1', '2026-10-17T09:00:00'), msg('b', 'u1', '2026-10-17T09:30:00')],
      'me',
      NOW,
    );
    expect(items.filter((item) => item.kind === 'group')).toHaveLength(2);
  });

  test('a message still sending joins the run before it', () => {
    const items = buildChatTimeline([msg('a', 'me', '2026-10-17T09:00:00'), msg('b', 'me', '')], 'me', NOW);
    const groups = items.filter((item): item is ChatGroupItem => item.kind === 'group');
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(2);
  });
});

describe('formatDayLabel', () => {
  test('names today and yesterday', () => {
    expect(formatDayLabel(new Date('2026-10-17T01:00:00'), NOW)).toBe('Today');
    expect(formatDayLabel(new Date('2026-10-16T23:00:00'), NOW)).toBe('Yesterday');
  });
});
