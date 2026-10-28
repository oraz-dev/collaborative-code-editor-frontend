import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatMediaGrid } from './ChatMediaGrid';
import type { ChatAttachment } from '../../model/types/chatMessage';

const photo = (id: string): ChatAttachment => ({
  id, kind: 'image', contentType: 'image/png', filename: `${id}.png`, sizeBytes: 1, url: `/api/v1/chat/attachments/${id}?sig=1`, urlExpiresAt: '',
});
const video: ChatAttachment = { ...photo('clip'), kind: 'video', contentType: 'video/mp4', filename: 'clip.mp4' };

describe('ChatMediaGrid', () => {
  test('shows every attachment from its signed link and opens the one pressed', async () => {
    const onOpen = vi.fn();
    render(<ChatMediaGrid attachments={[photo('a'), video]} onOpen={onOpen} />);

    expect(screen.getByAltText('a.png')).toHaveAttribute('src', '/api/v1/chat/attachments/a?sig=1');
    await userEvent.click(screen.getByRole('button', { name: 'Open video clip.mp4' }));
    expect(onOpen).toHaveBeenCalledWith('clip');
  });

  test('asks for fresh links when one fails to load', () => {
    const onExpired = vi.fn();
    render(<ChatMediaGrid attachments={[photo('b')]} onOpen={vi.fn()} onExpired={onExpired} />);
    fireEvent.error(screen.getByAltText('b.png'));
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reloading…')).toBeInTheDocument();
  });

  test('switches to a fresh link once it arrives', () => {
    const { rerender } = render(<ChatMediaGrid attachments={[photo('c')]} onOpen={vi.fn()} onExpired={vi.fn()} />);
    fireEvent.error(screen.getByAltText('c.png'));
    rerender(<ChatMediaGrid attachments={[{ ...photo('c'), url: '/fresh' }]} onOpen={vi.fn()} onExpired={vi.fn()} />);
    expect(screen.getByAltText('c.png')).toHaveAttribute('src', '/fresh');
  });
});
