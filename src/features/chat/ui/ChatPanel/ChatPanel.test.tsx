import { render, screen } from '@testing-library/react';
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

  test('a quick reaction sends that emoji straight away', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Send 👍' }));
    expect(props.onSend).toHaveBeenCalledWith('👍');
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
    expect(props.onSend).toHaveBeenCalledWith('nice 🔥');
  });

  test('switching theme restyles the panel and is remembered', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('chat-theme-toggle'));
    await user.click(screen.getByRole('button', { name: 'Doodle theme' }));
    expect(screen.getByRole('region', { name: 'Document chat' })).toHaveAttribute('data-skin', 'doodle');
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

    expect(props.onSend).toHaveBeenCalledWith('hey everyone');
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
});
