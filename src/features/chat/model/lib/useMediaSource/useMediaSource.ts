import { useCallback, useState } from 'react';
import { resolveAttachmentUrl } from '../../api/chatApi';
import { localPreviewFor } from '../localMediaPreviews/localMediaPreviews';
import type { ChatAttachment } from '../../types/chatMessage';

export interface MediaSource {
  src: string;
  /** The current link failed to load (expired, most likely). */
  broken: boolean;
  onError: () => void;
}

/**
 * Where to load an attachment from. A file this tab uploaded shows from disk;
 * anything else from its signed link.
 *
 * The link in use is kept even when a refresh brings a newer one, so a video
 * that is playing is never reset under the viewer. Only once it fails does
 * the element move to the newest link — and the failure itself asks for one.
 */
export function useMediaSource(attachment: ChatAttachment, onExpired?: () => void): MediaSource {
  const latest = localPreviewFor(attachment.id) ?? resolveAttachmentUrl(attachment.url);
  const [src, setSrc] = useState(latest);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // A fresh link arrived for one that failed: switch to it.
  if (failedSrc !== null && failedSrc === src && latest !== src) {
    setSrc(latest);
  }

  const onError = useCallback(() => {
    setFailedSrc(src);
    onExpired?.();
  }, [onExpired, src]);

  return { src, broken: failedSrc === src, onError };
}
