import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useDocumentChat, type ChatTransport } from './useDocumentChat';

const api = vi.hoisted(() => ({
  fetchChatMessages: vi.fn(),
  postChatMessage: vi.fn(),
  uploadChatAttachment: vi.fn(),
}));

vi.mock('../api/chatApi', () => api);

const message = (over: Record<string, unknown> = {}) => ({
  id: 'srv-1',
  documentId: 'doc-1',
  userId: 'user-2',
  body: 'from history',
  clientMsgId: 'hist-1',
  createdAt: '2026-10-16T09:00:00Z',
  attachments: [],
  ...over,
});

function makeTransport() {
  let listener: ((raw: Record<string, unknown>) => void) | null = null;
  const transport: ChatTransport = {
    sendChat: vi.fn(() => true),
    subscribeChat: vi.fn((fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    }),
  };
  return {
    transport,
    emit: (raw: Record<string, unknown>) => listener?.(raw),
  };
}

function setup(transport: ChatTransport) {
  return renderHook(() =>
    useDocumentChat({ documentId: 'doc-1', selfUserId: 'user-1', transport }),
  );
}

beforeEach(() => {
  api.fetchChatMessages.mockReset().mockResolvedValue({ messages: [], nextCursor: null });
  api.postChatMessage.mockReset();
});

describe('useDocumentChat', () => {
  test('loads history on open, oldest first', async () => {
    api.fetchChatMessages.mockResolvedValue({
      messages: [message({ clientMsgId: 'a', createdAt: '2026-10-16T09:00:00Z' })],
      nextCursor: 'cursor-1',
    });
    const { transport } = makeTransport();
    const { result } = setup(transport);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages.map((m) => m.clientMsgId)).toEqual(['a']);
    expect(result.current.hasMore).toBe(true);
  });

  test('a send shows optimistically, then a server echo confirms it', async () => {
    const { transport, emit } = makeTransport();
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.send('  hello team  '));

    // Trimmed, tagged as the sender, and in flight.
    expect(result.current.messages).toHaveLength(1);
    const optimistic = result.current.messages[0];
    expect(optimistic).toMatchObject({ body: 'hello team', userId: 'user-1', status: 'sending' });
    expect(transport.sendChat).toHaveBeenCalledWith('hello team', optimistic.clientMsgId, []);

    act(() =>
      emit({
        type: 'chat:message',
        id: 'srv-9',
        document_id: 'doc-1',
        user_id: 'user-1',
        body: 'hello team',
        client_msg_id: optimistic.clientMsgId,
        created_at: '2026-10-16T10:00:00Z',
      }),
    );

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ id: 'srv-9', status: 'sent' });
  });

  test('falls back to REST when the socket is closed', async () => {
    const { transport } = makeTransport();
    (transport.sendChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    api.postChatMessage.mockResolvedValue(
      message({ clientMsgId: 'ignored', body: 'offline note', userId: 'user-1' }),
    );
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.send('offline note'));
    await waitFor(() => expect(api.postChatMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.messages[0].status).toBe('sent'));
  });

  test('a message whose REST send fails can be retried', async () => {
    const { transport } = makeTransport();
    (transport.sendChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    api.postChatMessage.mockRejectedValueOnce(new Error('network'));
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.send('will fail'));
    await waitFor(() => expect(result.current.messages[0].status).toBe('failed'));

    const clientMsgId = result.current.messages[0].clientMsgId;
    api.postChatMessage.mockResolvedValueOnce(message({ clientMsgId, body: 'will fail' }));
    act(() => result.current.retry(clientMsgId));
    await waitFor(() => expect(result.current.messages[0].status).toBe('sent'));
    // Same idempotency key both times — no duplicate row.
    expect(api.postChatMessage).toHaveBeenLastCalledWith('doc-1', {
      body: 'will fail',
      clientMsgId,
      attachmentIds: [],
    });
  });

  test('loadMore pages backwards with the cursor', async () => {
    api.fetchChatMessages
      .mockResolvedValueOnce({
        messages: [message({ clientMsgId: 'newest', createdAt: '2026-10-16T09:05:00Z' })],
        nextCursor: 'cursor-older',
      })
      .mockResolvedValueOnce({
        messages: [message({ clientMsgId: 'older', createdAt: '2026-10-16T08:00:00Z' })],
        nextCursor: null,
      });
    const { transport } = makeTransport();
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(api.fetchChatMessages).toHaveBeenLastCalledWith('doc-1', {
      before: 'cursor-older',
      limit: 50,
    });
    // Older message sorted above the newer one.
    expect(result.current.messages.map((m) => m.clientMsgId)).toEqual(['older', 'newest']);
  });

  test('ignores a live frame addressed to another document', async () => {
    const { transport, emit } = makeTransport();
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() =>
      emit({
        type: 'chat:message',
        document_id: 'other-doc',
        body: 'not ours',
        client_msg_id: 'x',
      }),
    );
    expect(result.current.messages).toHaveLength(0);
  });

  test('sends a photo-only message, naming its attachments', async () => {
    const { transport } = makeTransport();
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const photo = { id: 'att-1', kind: 'image' as const, contentType: 'image/png', filename: 'a.png', sizeBytes: 1, url: '/a', urlExpiresAt: '' };
    act(() => result.current.send('  ', [photo]));

    const [optimistic] = result.current.messages;
    expect(optimistic).toMatchObject({ body: '', status: 'sending', attachments: [photo] });
    expect(transport.sendChat).toHaveBeenCalledWith('', optimistic.clientMsgId, ['att-1']);
  });

  test('ignores a send with neither text nor attachments', async () => {
    const { transport } = makeTransport();
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.send('   ', []));
    expect(result.current.messages).toHaveLength(0);
    expect(transport.sendChat).not.toHaveBeenCalled();
  });

  test('the REST fallback carries attachment ids too', async () => {
    const { transport } = makeTransport();
    (transport.sendChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    api.postChatMessage.mockResolvedValue(message({ userId: 'user-1' }));
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const clip = { id: 'att-2', kind: 'video' as const, contentType: 'video/mp4', filename: 'c.mp4', sizeBytes: 1, url: '/c', urlExpiresAt: '' };
    act(() => result.current.send('look', [clip]));
    await waitFor(() => expect(api.postChatMessage).toHaveBeenCalledWith('doc-1', expect.objectContaining({ attachmentIds: ['att-2'] })));
  });

  test('upload goes to this document', async () => {
    const { transport } = makeTransport();
    api.uploadChatAttachment.mockResolvedValue({ id: 'att-3' });
    const { result } = setup(transport);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(result.current.upload(file)).resolves.toEqual({ id: 'att-3' });
    expect(api.uploadChatAttachment).toHaveBeenCalledWith('doc-1', file, undefined);
  });

  test('refreshMedia reloads history for fresh signed links', async () => {
    const stale = { id: 'att-4', kind: 'image', contentType: 'image/png', filename: 'p.png', sizeBytes: 1, url: '/old', urlExpiresAt: '' };
    api.fetchChatMessages.mockResolvedValueOnce({ messages: [message({ clientMsgId: 'p', attachments: [stale] })], nextCursor: null });
    const { transport } = makeTransport();
    const { result } = setup(transport);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    api.fetchChatMessages.mockResolvedValueOnce({
      messages: [message({ clientMsgId: 'p', attachments: [{ ...stale, url: '/fresh' }] })],
      nextCursor: null,
    });
    act(() => result.current.refreshMedia());
    await waitFor(() => expect(result.current.messages[0].attachments[0].url).toBe('/fresh'));
  });
});
