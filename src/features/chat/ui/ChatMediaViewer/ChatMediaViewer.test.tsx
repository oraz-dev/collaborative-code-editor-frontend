import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatMediaViewer, type ChatMediaViewerItem } from './ChatMediaViewer';

const item = (id: string, kind: 'image' | 'video' = 'image'): ChatMediaViewerItem => ({
  attachment: { id, kind, contentType: kind === 'image' ? 'image/png' : 'video/mp4', filename: `${id}.${kind === 'image' ? 'png' : 'mp4'}`, sizeBytes: 2048, url: `/m/${id}`, urlExpiresAt: '' },
  authorName: 'Ada',
  createdAt: '2026-10-28T10:00:00Z',
});

describe('ChatMediaViewer', () => {
  test('shows the item with its author and pages with the arrow keys', async () => {
    const onIndexChange = vi.fn();
    render(<ChatMediaViewer items={[item('a'), item('b', 'video')]} index={0} onIndexChange={onIndexChange} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Photo 1 of 2' })).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByTestId('chat-viewer-image')).toHaveAttribute('src', '/m/a');
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  test('plays a video with controls', () => {
    render(<ChatMediaViewer items={[item('v', 'video')]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('chat-viewer-video')).toHaveAttribute('controls');
  });

  test('closes from the button and from Escape', async () => {
    const onClose = vi.fn();
    render(<ChatMediaViewer items={[item('a')]} index={0} onIndexChange={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close viewer' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
