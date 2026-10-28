import { memo, type CSSProperties } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import type { PendingUpload } from '../../model/useChatUploads/useChatUploads';
import cls from './ChatAttachmentTray.module.scss';

interface ChatAttachmentTrayProps {
  className?: string;
  items: readonly PendingUpload[];
  /** Why picked files were turned away. */
  notice: string | null;
  /** A send is waiting for the uploads. */
  queued: boolean;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
  onDismissNotice: () => void;
}

/** Circumference of the progress ring (r = 15). */
const RING = 2 * Math.PI * 15;

/** The photos and videos about to be sent, each uploading as it waits. */
export const ChatAttachmentTray = memo((props: ChatAttachmentTrayProps) => {
  const { className, items, notice, queued, onRemove, onRetry, onDismissNotice } = props;
  const failed = items.find((item) => item.status === 'error');
  const uploading = items.filter((item) => item.status === 'uploading').length;

  if (items.length === 0 && !notice) return null;

  return (
    <div className={classNames(cls.tray, {}, [className])} data-testid="chat-attachment-tray">
      {items.length > 0 && (
        <ul className={cls.list} aria-label="Attachments to send">
          {items.map((item) => {
            const name = item.file.name || (item.kind === 'video' ? 'video' : 'photo');
            return (
              <li
                key={item.key}
                className={classNames(cls.item, { [cls.error]: item.status === 'error', [cls.done]: item.status === 'done' })}
                data-testid="chat-tray-item"
              >
                {item.kind === 'video' ? (
                  <video className={cls.thumb} src={`${item.previewUrl}#t=0.1`} muted playsInline preload="metadata" />
                ) : (
                  <img className={cls.thumb} src={item.previewUrl} alt="" draggable={false} />
                )}
                {item.kind === 'video' && <Icons.Play size={12} className={cls.videoBadge} aria-hidden="true" />}

                {item.status === 'uploading' && (
                  <svg
                    className={cls.ring}
                    viewBox="0 0 36 36"
                    role="progressbar"
                    aria-label={`Uploading ${name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(item.progress * 100)}
                  >
                    <circle className={cls.ringTrack} cx="18" cy="18" r="15" />
                    <circle
                      className={cls.ringValue}
                      cx="18"
                      cy="18"
                      r="15"
                      style={{ '--dash': RING, '--offset': RING * (1 - Math.max(0.04, item.progress)) } as CSSProperties}
                    />
                  </svg>
                )}

                {item.status === 'error' && (
                  <button
                    type="button"
                    className={cls.retry}
                    onClick={() => onRetry(item.key)}
                    aria-label={`Retry uploading ${name}`}
                    title={item.error ?? 'Upload failed'}
                  >
                    <Icons.Retry size={16} />
                  </button>
                )}

                <button
                  type="button"
                  className={cls.remove}
                  onClick={() => onRemove(item.key)}
                  aria-label={`Remove ${name}`}
                >
                  <Icons.X size={11} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {failed ? (
        <p className={classNames(cls.message, {}, [cls.messageError])} role="alert">
          {failed.error ?? 'Upload failed.'} Retry it or remove it to send.
        </p>
      ) : queued && uploading > 0 ? (
        <p className={cls.message} aria-live="polite">
          Sends as soon as {uploading === 1 ? 'the upload finishes' : `${uploading} uploads finish`}.
        </p>
      ) : null}

      {notice && (
        <p className={classNames(cls.message, {}, [cls.messageError])} role="alert">
          <span>{notice}</span>
          <button type="button" className={cls.dismiss} onClick={onDismissNotice} aria-label="Dismiss">
            <Icons.X size={12} />
          </button>
        </p>
      )}
    </div>
  );
});
