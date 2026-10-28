import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatAttachmentTray } from './ChatAttachmentTray';
import type { PendingUpload } from '../../model/useChatUploads/useChatUploads';

const pending = (over: Partial<PendingUpload>): PendingUpload => ({
  key: 'k1',
  file: new File(['x'], 'shot.png', { type: 'image/png' }),
  kind: 'image',
  previewUrl: 'blob:1',
  progress: 0.4,
  status: 'uploading',
  error: null,
  attachment: null,
  ...over,
});

function setup(items: PendingUpload[], extra: { notice?: string | null; queued?: boolean } = {}) {
  const props = { items, notice: extra.notice ?? null, queued: extra.queued ?? false, onRemove: vi.fn(), onRetry: vi.fn(), onDismissNotice: vi.fn() };
  render(<ChatAttachmentTray {...props} />);
  return props;
}

describe('ChatAttachmentTray', () => {
  test('shows upload progress and removes a file', async () => {
    const props = setup([pending({})]);
    expect(screen.getByRole('progressbar', { name: 'Uploading shot.png' })).toHaveAttribute('aria-valuenow', '40');
    await userEvent.click(screen.getByRole('button', { name: 'Remove shot.png' }));
    expect(props.onRemove).toHaveBeenCalledWith('k1');
  });

  test('a failed upload explains itself and can be retried', async () => {
    const props = setup([pending({ status: 'error', error: 'Uploading too quickly.' })]);
    expect(screen.getByRole('alert')).toHaveTextContent('Uploading too quickly. Retry it or remove it to send.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry uploading shot.png' }));
    expect(props.onRetry).toHaveBeenCalledWith('k1');
  });

  test('says a queued send is waiting', () => {
    setup([pending({})], { queued: true });
    expect(screen.getByText('Sends as soon as the upload finishes.')).toBeInTheDocument();
  });

  test('renders nothing when empty', () => {
    const { container } = render(
      <ChatAttachmentTray items={[]} notice={null} queued={false} onRemove={vi.fn()} onRetry={vi.fn()} onDismissNotice={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
