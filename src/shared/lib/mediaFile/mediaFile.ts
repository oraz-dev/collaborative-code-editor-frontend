/**
 * Which files are meant to be looked at rather than read, and how to turn the
 * text a workspace stores into something a browser can render.
 *
 * Documents are text end to end — the service has no blob storage — so an
 * image or a clip in a workspace is one of four things: markup (an `.svg`), a
 * `data:` URL that was pasted or generated into the file, a link to a file
 * hosted elsewhere, or bare base64. Each of those becomes a URL; anything else
 * is not media we can show, and saying so is better than an empty frame.
 */
import { extensionOf } from '../fileType/fileType';

export type MediaKind = 'image' | 'video' | 'audio';

/** How the file's text carried the media — what the viewer explains on failure. */
export type MediaEncoding = 'markup' | 'data-url' | 'link' | 'base64';

export interface MediaSource {
  kind: MediaKind;
  /** Ready for `src`: a `data:`, `http(s):` or protocol-relative URL. */
  src: string;
  mime: string;
  encoding: MediaEncoding;
  /** Size of the media itself, as close as the text allows. */
  byteSize: number;
}

interface MediaType {
  kind: MediaKind;
  mime: string;
}

const MEDIA_TYPES: Record<string, MediaType> = {
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  avif: { kind: 'image', mime: 'image/avif' },
  bmp: { kind: 'image', mime: 'image/bmp' },
  ico: { kind: 'image', mime: 'image/x-icon' },
  svg: { kind: 'image', mime: 'image/svg+xml' },

  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  ogv: { kind: 'video', mime: 'video/ogg' },
  mov: { kind: 'video', mime: 'video/quicktime' },

  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  oga: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' },
  flac: { kind: 'audio', mime: 'audio/flac' },
};

/** Null for a file the editor should open as text, as it always has. */
export function mediaKindFor(fileName: string): MediaKind | null {
  return MEDIA_TYPES[extensionOf(fileName)]?.kind ?? null;
}

/**
 * Media whose text is worth editing by hand, so the editor is offered beside
 * the picture. SVG is the only one — every other format is bytes.
 */
export function isTextMedia(fileName: string): boolean {
  return extensionOf(fileName) === 'svg';
}

const HUMAN_KIND: Record<MediaKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

export function mediaKindLabel(kind: MediaKind): string {
  return HUMAN_KIND[kind];
}

/**
 * Base64 and nothing else: the whole file, padding included.
 *
 * Deliberately strict. A loose test would call any long run of letters base64
 * and hand the browser a broken image instead of an explanation.
 */
const BASE64 = /^[A-Za-z0-9+/\s]+={0,2}$/;
const MIN_BASE64_LENGTH = 16;

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Bytes a base64 payload decodes to, without decoding it. */
function base64Length(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function fromDataUrl(url: string, kind: MediaKind, fallbackMime: string): MediaSource {
  const comma = url.indexOf(',');
  const header = comma > 0 ? url.slice(5, comma) : '';
  const payload = comma > 0 ? url.slice(comma + 1) : '';
  const mime = header.split(';')[0] || fallbackMime;
  const byteSize = /;base64/i.test(header)
    ? base64Length(payload)
    : utf8Length(decodeURIComponent(payload));

  return { kind, src: url, mime, encoding: 'data-url', byteSize };
}

/**
 * What to render for this file, or null when its text is not media at all.
 *
 * Never throws: a `data:` URL with a malformed percent-escape is still a URL
 * the browser may well render, so only its size is given up on.
 */
export function mediaSourceFor(fileName: string, content: string): MediaSource | null {
  const type = MEDIA_TYPES[extensionOf(fileName)];
  if (!type) return null;

  const trimmed = content.trim();
  if (!trimmed) return null;

  if (/^data:/i.test(trimmed)) {
    const url = trimmed.replace(/\s+/g, '');
    try {
      return fromDataUrl(url, type.kind, type.mime);
    } catch {
      return { kind: type.kind, src: url, mime: type.mime, encoding: 'data-url', byteSize: 0 };
    }
  }

  // A link is one token — anything with whitespace in it is a file that merely
  // happens to start with a URL.
  if (/^(?:https?:)?\/\/\S+$/i.test(trimmed)) {
    return {
      kind: type.kind,
      src: trimmed,
      mime: type.mime,
      encoding: 'link',
      byteSize: 0,
    };
  }

  // Percent-encoded rather than base64: smaller for text, and it keeps the
  // markup readable in devtools. Encodes the file as written, not trimmed, so
  // the preview matches the source exactly.
  if (type.mime === 'image/svg+xml' && /<svg[\s>]/i.test(trimmed)) {
    return {
      kind: 'image',
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`,
      mime: type.mime,
      encoding: 'markup',
      byteSize: utf8Length(content),
    };
  }

  const packed = trimmed.replace(/\s+/g, '');
  if (packed.length >= MIN_BASE64_LENGTH && packed.length % 4 === 0 && BASE64.test(trimmed)) {
    return {
      kind: type.kind,
      src: `data:${type.mime};base64,${packed}`,
      mime: type.mime,
      encoding: 'base64',
      byteSize: base64Length(packed),
    };
  }

  return null;
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

/** Compact size for the viewer's toolbar: `1.4 MB`, `812 B`. */
export function formatByteSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes are exact; anything scaled reads better to one decimal.
  const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0);
  return `${rounded} ${UNITS[unit]}`;
}
