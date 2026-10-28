/**
 * What the server accepts as a chat attachment. It decides the type from the
 * file's contents; these let the composer turn away an obvious mismatch before
 * spending an upload on it, with a reason a person can act on.
 */
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const CHAT_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const CHAT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/** Per message. */
export const CHAT_MAX_ATTACHMENTS = 10;

/** For the file input's `accept`. */
export const CHAT_MEDIA_ACCEPT = [...CHAT_IMAGE_TYPES, ...CHAT_VIDEO_TYPES, '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'].join(',');

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/** The browser's MIME type, or a guess from the extension when it gave none. */
export function mediaTypeOf(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? '';
}
