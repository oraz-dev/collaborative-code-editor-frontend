import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PresencePeer } from '@/features/collaboration';
import { ChatPanel } from './ChatPanel';
import { chatAppearanceStore } from '../../model/chatAppearance/chatAppearanceStore';
import type { ChatMessageView } from '../../model/types/chatMessage';

// The panel resolves names of absent authors through the profile lookup; the
// list rendering is what is under test, so the lookup is stubbed out.
vi.mock('@/entities/User', () => ({
  useUsersByIds: () => ({ data: [] }),
}));

const PEERS: PresencePeer[] = [
  { clientId: 2, userId: 'user-2', name: 'Ada Lovelace', color: 'var(--presence-2)', isSelf: false },
];

function msg(over: Partial<ChatMessageView> & { clientMsgId: string }): ChatMessageView {
  return {
    id: 'srv',
    documentId: 'doc-1',
    userId: 'user-2',
    body: 'hi',
    createdAt: '2026-10-16T10:00:00Z',
    status: 'sent',
    localSeq: 1,
    attachments: [],
    ...over,
  };
}

function renderPanel(over: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  const props = {
    messages: [] as ChatMessageView[],
    selfUserId: 'user-1',
    peers: PEERS,
    status: 'connected' as const,
    isLoading: false,
    error: null,
    hasMore: false,
    isLoadingMore: false,
    onLoadMore: vi.fn(),
    onSend: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    onUpload: vi.fn(),
    onMediaExpired: vi.fn(),
    ...over,
  };
  render(<ChatPanel {...props} />);
  return props;
}

describe('ChatPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    chatAppearanceStore.reload();
  });

  test('shows the empty state when there are no messages', () => {
    renderPanel();
    expect(screen.getByTestId('chat-empty')).toBeInTheDocument();
  });

  test('names a peer author and renders their message', () => {
    renderPanel({ messages: [msg({ clientMsgId: 'a', body: 'hello there' })] });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('hello there')).toBeInTheDocument();
  });

  test('labels the viewer’s own messages as "You" for screen readers', () => {
    renderPanel({
      messages: [msg({ clientMsgId: 'b', userId: 'user-1', body: 'mine' })],
    });
    expect(screen.getByText('mine')).toHaveTextContent(/^You: mine/);
  });

  test('a day label heads the conversation', () => {
    renderPanel({ messages: [msg({ clientMsgId: 'e', createdAt: new Date().toISOString() })] });
    expect(screen.getByRole('separator', { name: 'Today' })).toBeInTheDocument();
  });

  test('the emoji button inserts into the draft', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await user.type(screen.getByTestId('chat-input'), 'nice ');
    await user.click(screen.getByTestId('chat-emoji-toggle'));
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    await user.click(screen.getAllByText('🔥')[0]);
    expect(screen.getByTestId('chat-input')).toHaveValue('nice 🔥');
    await user.keyboard('{Enter}');
    expect(props.onSend).toHaveBeenCalledWith('nice 🔥', []);
  });

  test('switching theme restyles the panel and is remembered', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('chat-theme-toggle'));
    await user.click(screen.getByRole('button', { name: 'Doodle theme' }));
    expect(screen.getByTestId('chat-body')).toHaveAttribute('data-skin', 'doodle');
    // The picker sits outside the themed area, so its previews keep their own skins.
    expect(screen.getByTestId('chat-body')).not.toContainElement(screen.getByTestId('chat-theme-picker'));
    expect(chatAppearanceStore.get().skin).toBe('doodle');
  });

  test('Escape closes the theme picker', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('chat-theme-toggle'));
    expect(screen.getByTestId('chat-theme-picker')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('chat-theme-picker')).not.toBeInTheDocument();
  });

  test('Enter sends the trimmed draft', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.type(screen.getByTestId('chat-input'), '  hey everyone  ');
    await user.keyboard('{Enter}');

    expect(props.onSend).toHaveBeenCalledWith('hey everyone', []);
  });

  test('Shift+Enter does not send', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.type(screen.getByTestId('chat-input'), 'line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(props.onSend).not.toHaveBeenCalled();
  });

  test('a failed message offers a retry', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      messages: [msg({ clientMsgId: 'c', userId: 'user-1', status: 'failed', body: 'oops' })],
    });

    await user.click(screen.getByRole('button', { name: 'Retry sending this message' }));
    expect(props.onRetry).toHaveBeenCalledWith('c');
  });

  test('offers to load older messages when there are more', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      hasMore: true,
      messages: [msg({ clientMsgId: 'd' })],
    });

    await user.click(screen.getByRole('button', { name: 'Load older messages' }));
    expect(props.onLoadMore).toHaveBeenCalled();
  });

  test('attaching a photo uploads it and sends it with the caption', async () => {
    const user = userEvent.setup();
    const photo = { id: 'att-1', kind: 'image' as const, contentType: 'image/png', filename: 'shot.png', sizeBytes: 10, url: '/a', urlExpiresAt: '' };
    const onUpload = vi.fn().mockResolvedValue(photo);
    const props = renderPanel({ onUpload });

    await user.upload(screen.getByTestId('chat-file-input'), new File(['x'], 'shot.png', { type: 'image/png' }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chat-tray-item')).toBeInTheDocument();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('placeholder', 'Add a caption');

    await user.type(screen.getByTestId('chat-input'), 'look{Enter}');
    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith('look', [photo]));
    expect(screen.queryByTestId('chat-tray-item')).not.toBeInTheDocument();
  });

  test('a photo can be sent with no caption', async () => {
    const user = userEvent.setup();
    const photo = { id: 'att-2', kind: 'image' as const, contentType: 'image/png', filename: 'p.png', sizeBytes: 10, url: '/p', urlExpiresAt: '' };
    const props = renderPanel({ onUpload: vi.fn().mockResolvedValue(photo) });

    await user.upload(screen.getByTestId('chat-file-input'), new File(['x'], 'p.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeEnabled());
    await user.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith('', [photo]));
  });

  test('turns away a file that is not a photo or video', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onUpload = vi.fn();
    renderPanel({ onUpload });
    await user.upload(screen.getByTestId('chat-file-input'), new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('notes.pdf');
  });

  test('a photo in the chat opens full screen', async () => {
    const user = userEvent.setup();
    renderPanel({
      messages: [msg({
        clientMsgId: 'm1',
        body: '',
        attachments: [{ id: 'a1', kind: 'image', contentType: 'image/png', filename: 'cat.png', sizeBytes: 2048, url: '/api/v1/chat/attachments/a1?sig=1', urlExpiresAt: '' }],
      })],
    });
    await user.click(screen.getByRole('button', { name: 'Open photo cat.png' }));
    expect(screen.getByTestId('chat-media-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('chat-viewer-download')).toHaveAttribute('download', 'cat.png');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('chat-media-viewer')).not.toBeInTheDocument();
  });
});
