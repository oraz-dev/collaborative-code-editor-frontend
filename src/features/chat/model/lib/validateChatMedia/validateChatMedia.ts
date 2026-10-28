import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_TYPES,
  CHAT_MAX_ATTACHMENTS,
  CHAT_VIDEO_MAX_BYTES,
  CHAT_VIDEO_TYPES,
  mediaTypeOf,
} from '../../consts/chatMedia';
import type { ChatAttachmentKind } from '../../types/chatMessage';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** A video's length as the player shows it: 0:07, 12:40. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export interface MediaCheck {
  accepted: { file: File; kind: ChatAttachmentKind }[];
  /** One sentence per file turned away, ready to show. */
  rejected: string[];
}

/**
 * Splits picked, dropped or pasted files into ones worth uploading and
 * reasons for the rest. `room` is how many more fit in this message.
 */
export function validateChatMedia(files: readonly File[], room: number): MediaCheck {
  const accepted: MediaCheck['accepted'] = [];
  const rejected: string[] = [];
  let overflow = 0;

  files.forEach((file) => {
    const type = mediaTypeOf(file);
    const name = file.name || 'That file';
    const isImage = (CHAT_IMAGE_TYPES as readonly string[]).includes(type);
    const isVideo = (CHAT_VIDEO_TYPES as readonly string[]).includes(type);

    if (!isImage && !isVideo) {
      rejected.push(`“${name}” can’t be sent. Photos can be JPEG, PNG, GIF or WebP; videos MP4, WebM or MOV.`);
      return;
    }

    const limit = isImage ? CHAT_IMAGE_MAX_BYTES : CHAT_VIDEO_MAX_BYTES;
    if (file.size > limit) {
      rejected.push(`“${name}” is ${formatBytes(file.size)}. ${isImage ? 'Photos' : 'Videos'} can be up to ${formatBytes(limit)}.`);
      return;
    }

    if (accepted.length >= room) {
      overflow += 1;
      return;
    }

    accepted.push({ file, kind: isImage ? 'image' : 'video' });
  });

  if (overflow > 0) {
    rejected.push(`A message can carry up to ${CHAT_MAX_ATTACHMENTS} photos or videos, so ${overflow} ${overflow === 1 ? 'was' : 'were'} left out.`);
  }

  return { accepted, rejected };
}
