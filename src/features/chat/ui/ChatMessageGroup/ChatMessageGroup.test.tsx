import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatDayDivider, ChatMessageGroup } from './ChatMessageGroup';
import type { ChatMessageView } from '../../model/types/chatMessage';

function msg(over: Partial<ChatMessageView> & { clientMsgId: string }): ChatMessageView {
  return {
    id: over.clientMsgId,
    documentId: 'doc-1',
    userId: 'user-2',
    body: 'hi',
    createdAt: '2026-10-17T09:14:00Z',
    status: 'sent',
    localSeq: 0,
    ...over,
  };
}

const AUTHOR = { authorName: 'Ada Lovelace', authorInitials: 'AL', authorColor: '#e5684f' };

describe('ChatMessageGroup', () => {
  test('names a peer once, on the first bubble of the run', () => {
    render(
      <ChatMessageGroup
        mine={false}
        messages={[msg({ clientMsgId: 'a', body: 'one' }), msg({ clientMsgId: 'b', body: 'two' })]}
        {...AUTHOR}
      />,
    );
    expect(screen.getAllByTestId('chat-message')).toHaveLength(2);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  test('shows the delivery state of the viewer’s own messages', () => {
    render(
      <ChatMessageGroup
        mine
        messages={[msg({ clientMsgId: 'a', status: 'sending' }), msg({ clientMsgId: 'b' })]}
        {...AUTHOR}
        authorName="You"
      />,
    );
    expect(screen.getByLabelText('Sending')).toBeInTheDocument();
    expect(screen.getByLabelText('Sent')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  test('a failed message offers a retry', async () => {
    const onRetry = vi.fn();
    render(<ChatMessageGroup mine messages={[msg({ clientMsgId: 'c', status: 'failed' })]} {...AUTHOR} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry sending this message' }));
    expect(onRetry).toHaveBeenCalledWith('c');
  });

  test('an emoji-only message gets no name label', () => {
    render(<ChatMessageGroup mine={false} messages={[msg({ clientMsgId: 'd', body: '🔥' })]} {...AUTHOR} />);
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });
});

describe('ChatDayDivider', () => {
  test('renders its label as a separator', () => {
    render(<ChatDayDivider label="Today" />);
    expect(screen.getByRole('separator', { name: 'Today' })).toHaveTextContent('Today');
  });
});
