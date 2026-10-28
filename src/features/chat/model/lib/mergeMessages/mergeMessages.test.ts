import { describe, expect, test } from 'vitest';
import type { ChatMessageStatus, ChatMessageView } from '../../types/chatMessage';
import { mergeMessages } from './mergeMessages';

function view(
  over: Partial<ChatMessageView> & { clientMsgId: string },
): ChatMessageView {
  return {
    id: null,
    documentId: 'doc-1',
    userId: 'user-1',
    body: 'hi',
    createdAt: '',
    status: 'sent' as ChatMessageStatus,
    localSeq: 0,
    attachments: [],
    ...over,
  };
}

describe('mergeMessages', () => {
  test('sorts by timestamp, oldest first', () => {
    const merged = mergeMessages([
      view({ clientMsgId: 'b', createdAt: '2026-10-16T10:02:00Z', localSeq: 2 }),
      view({ clientMsgId: 'a', createdAt: '2026-10-16T10:01:00Z', localSeq: 1 }),
    ]);
    expect(merged.map((m) => m.clientMsgId)).toEqual(['a', 'b']);
  });

  test('keeps a message with no timestamp (still sending) at the foot', () => {
    const merged = mergeMessages([
      view({ clientMsgId: 'sending', createdAt: '', status: 'sending', localSeq: 5 }),
      view({ clientMsgId: 'old', createdAt: '2026-10-16T10:00:00Z', localSeq: 1 }),
    ]);
    expect(merged.map((m) => m.clientMsgId)).toEqual(['old', 'sending']);
  });

  test('an echo upgrades an optimistic message in place, not as a duplicate', () => {
    const optimistic = view({
      clientMsgId: 'cmid-1',
      status: 'sending',
      createdAt: '',
      localSeq: 3,
    });
    const echo = view({
      clientMsgId: 'cmid-1',
      id: 'srv-1',
      status: 'sent',
      createdAt: '2026-10-16T10:05:00Z',
      localSeq: 99,
    });

    const merged = mergeMessages([optimistic], [echo]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'srv-1', status: 'sent', localSeq: 3 });
  });

  test('a stale frame cannot knock a sent message back to sending', () => {
    const sent = view({ clientMsgId: 'cmid-1', status: 'sent', id: 'srv-1' });
    const stale = view({ clientMsgId: 'cmid-1', status: 'sending' });
    expect(mergeMessages([sent], [stale])[0].status).toBe('sent');
  });

  test('a retry (sending) wins over a prior failure', () => {
    const failed = view({ clientMsgId: 'cmid-1', status: 'failed' });
    const retrying = view({ clientMsgId: 'cmid-1', status: 'sending' });
    expect(mergeMessages([failed], [retrying])[0].status).toBe('sending');
  });
});
