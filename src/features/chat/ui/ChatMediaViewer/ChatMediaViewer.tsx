import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { formatMessageTime } from '../../model/lib/buildChatTimeline/buildChatTimeline';
import { useMediaSource } from '../../model/lib/useMediaSource/useMediaSource';
import { formatBytes } from '../../model/lib/validateChatMedia/validateChatMedia';
import type { ChatAttachment } from '../../model/types/chatMessage';
import cls from './ChatMediaViewer.module.scss';

export interface ChatMediaViewerItem {
  attachment: ChatAttachment;
  authorName: string;
  createdAt: string;
}

interface ChatMediaViewerProps {
  className?: string;
  items: readonly ChatMediaViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onExpired?: () => void;
}

/** A horizontal swipe longer than this pages to the neighbouring item. */
const SWIPE_PX = 50;

interface StageProps {
  attachment: ChatAttachment;
  onExpired?: () => void;
}

const Stage = memo(({ attachment, onExpired }: StageProps) => {
  const { src, broken, onError } = useMediaSource(attachment, onExpired);
  const [ready, setReady] = useState(false);

  if (broken) {
    return (
      <div className={cls.notice}>
        <Icons.Image size={28} />
        <p>This link expired. Getting a fresh one…</p>
      </div>
    );
  }

  return (
    <>
      {!ready && <Spinner size="large" label="Loading" className={cls.spinner} />}
      {attachment.kind === 'video' ? (
        <video
          key={src}
          className={classNames(cls.media, { [cls.ready]: ready })}
          src={src}
          controls
          autoPlay
          playsInline
          onLoadedData={() => setReady(true)}
          onError={onError}
          data-testid="chat-viewer-video"
        />
      ) : (
        <img
          key={src}
          className={classNames(cls.media, { [cls.ready]: ready })}
          src={src}
          alt={attachment.filename || 'Photo'}
          onLoad={() => setReady(true)}
          onError={onError}
          draggable={false}
          data-testid="chat-viewer-image"
        />
      )}
    </>
  );
});

/**
 * Full-screen photos and videos from the chat. Arrows, ←/→ or a swipe move
 * through everything shared in the conversation; Esc or the backdrop closes.
 */
export const ChatMediaViewer = memo((props: ChatMediaViewerProps) => {
  const { className, items, index, onIndexChange, onClose, onExpired } = props;
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStartRef = useRef<number | null>(null);
  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);
  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowLeft') {
        goPrev();
      } else if (event.key === 'ArrowRight') {
        goNext();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [goNext, goPrev, onClose]);

  // Focus moves into the viewer and back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const onPointerDown = (event: PointerEvent) => {
    swipeStartRef.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (start === null) return;
    const dx = event.clientX - start;
    if (dx > SWIPE_PX) goPrev();
    else if (dx < -SWIPE_PX) goNext();
  };

  if (!current) return null;
  const { attachment } = current;
  const time = formatMessageTime(current.createdAt);
  const kindLabel = attachment.kind === 'video' ? 'Video' : 'Photo';

  return createPortal(
    <div
      className={classNames(cls.viewer, {}, [className])}
      role="dialog"
      aria-modal="true"
      aria-label={`${kindLabel} ${index + 1} of ${items.length}`}
      data-testid="chat-media-viewer"
    >
      <div className={cls.backdrop} onClick={onClose} aria-hidden="true" />

      <header className={cls.bar}>
        <div className={cls.info}>
          <span className={cls.author}>{current.authorName}</span>
          <span className={cls.detail}>
            {[time, attachment.filename, attachment.sizeBytes ? formatBytes(attachment.sizeBytes) : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {items.length > 1 && (
          <span className={cls.counter}>
            {index + 1} / {items.length}
          </span>
        )}
        <DownloadLink attachment={attachment} />
        <button ref={closeRef} type="button" className={cls.action} onClick={onClose} aria-label="Close viewer">
          <Icons.X size={20} />
        </button>
      </header>

      <div className={cls.stage} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <Stage key={attachment.id} attachment={attachment} onExpired={onExpired} />
      </div>

      {hasPrev && (
        <button type="button" className={classNames(cls.nav, {}, [cls.prev])} onClick={goPrev} aria-label="Previous">
          <Icons.ChevL size={24} />
        </button>
      )}
      {hasNext && (
        <button type="button" className={classNames(cls.nav, {}, [cls.next])} onClick={goNext} aria-label="Next">
          <Icons.ChevR size={24} />
        </button>
      )}
    </div>,
    document.body,
  );
});

const DownloadLink = memo(({ attachment }: { attachment: ChatAttachment }) => {
  const { src } = useMediaSource(attachment);
  return (
    <a
      className={cls.action}
      href={src}
      download={attachment.filename || true}
      aria-label={`Download ${attachment.filename || (attachment.kind === 'video' ? 'video' : 'photo')}`}
      data-testid="chat-viewer-download"
    >
      <Icons.Download size={19} />
    </a>
  );
});
