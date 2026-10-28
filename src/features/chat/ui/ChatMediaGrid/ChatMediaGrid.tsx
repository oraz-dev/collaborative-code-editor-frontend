import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { formatDuration } from '../../model/lib/validateChatMedia/validateChatMedia';
import { useMediaSource } from '../../model/lib/useMediaSource/useMediaSource';
import type { ChatAttachment } from '../../model/types/chatMessage';
import cls from './ChatMediaGrid.module.scss';

interface ChatMediaGridProps {
  className?: string;
  attachments: readonly ChatAttachment[];
  onOpen: (attachmentId: string) => void;
  /** A link failed — most likely expired — so fresh ones should be fetched. */
  onExpired?: () => void;
  /** Laid over the last tile: the time, for a message with no caption. */
  overlay?: ReactNode;
}

/** Tall photos are capped so one portrait shot does not fill the chat. */
const MIN_RATIO = 0.62;
const MAX_RATIO = 1.9;

interface MediaTileProps {
  attachment: ChatAttachment;
  single: boolean;
  onOpen: (attachmentId: string) => void;
  onExpired?: () => void;
  children?: ReactNode;
}

const MediaTile = memo(({ attachment, single, onOpen, onExpired, children }: MediaTileProps) => {
  const { src, broken, onError } = useMediaSource(attachment, onExpired);
  const [loaded, setLoaded] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [duration, setDuration] = useState('');
  const isVideo = attachment.kind === 'video';
  const label = `Open ${isVideo ? 'video' : 'photo'}${attachment.filename ? ` ${attachment.filename}` : ''}`;

  const onDimensions = (width: number, height: number) => {
    if (width > 0 && height > 0) setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height)));
    setLoaded(true);
  };

  const style = single && ratio ? ({ '--ratio': ratio } as CSSProperties) : undefined;

  return (
    <button
      type="button"
      className={classNames(cls.tile, { [cls.loaded]: loaded, [cls.broken]: broken })}
      style={style}
      onClick={() => onOpen(attachment.id)}
      aria-label={label}
      data-testid="chat-media-tile"
    >
      {broken ? (
        <span className={cls.fallback}>
          <Icons.Image size={22} />
          <span>Reloading…</span>
        </span>
      ) : isVideo ? (
        <video
          className={cls.media}
          // The fragment nudges Safari into painting the first frame.
          src={`${src}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setDuration(formatDuration(video.duration));
            onDimensions(video.videoWidth, video.videoHeight);
          }}
          onError={onError}
        />
      ) : (
        <img
          className={cls.media}
          src={src}
          alt={attachment.filename || 'Photo'}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(event) => onDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
          onError={onError}
        />
      )}

      {isVideo && !broken && (
        <>
          <span className={cls.play} aria-hidden="true">
            <Icons.Play size={18} />
          </span>
          {duration && <span className={cls.duration}>{duration}</span>}
        </>
      )}
      {children}
    </button>
  );
});

/**
 * A message's photos and videos as an album: one keeps its own shape, more
 * share a grid. Every tile opens the full-screen viewer.
 */
export const ChatMediaGrid = memo((props: ChatMediaGridProps) => {
  const { className, attachments, onOpen, onExpired, overlay } = props;
  const count = attachments.length;
  const layout = count >= 5 ? cls.many : cls[`n${count}`];

  return (
    <div className={classNames(cls.grid, {}, [className, layout])} data-testid="chat-media">
      {attachments.map((attachment, index) => (
        <MediaTile
          key={attachment.id}
          attachment={attachment}
          single={count === 1}
          onOpen={onOpen}
          onExpired={onExpired}
        >
          {index === count - 1 && overlay}
        </MediaTile>
      ))}
    </div>
  );
});
