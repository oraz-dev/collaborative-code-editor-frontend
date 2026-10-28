/** Wire shape of a chat attachment, as upload, history and the socket return it. */
export interface ChatAttachmentDto {
  id?: string;
  kind?: string;
  content_type?: string;
  filename?: string;
  size_bytes?: number;
  /** Signed, relative to the documents service's origin, usable as an img/video src. */
  url?: string;
  url_expires_at?: string;
  created_at?: string;
}

/** Wire shape of a chat message (snake_case), from REST and the socket alike. */
export interface ChatMessageDto {
  id?: string;
  document_id?: string;
  user_id?: string;
  body?: string;
  client_msg_id?: string;
  created_at?: string;
  attachments?: ChatAttachmentDto[] | null;
}

export type ChatAttachmentKind = 'image' | 'video';

export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  contentType: string;
  filename: string;
  sizeBytes: number;
  /**
   * Signed link — the signature is the authorisation, so it works as an img or
   * video src with no header. It expires after a few hours; reloading the
   * message from history returns a fresh one.
   */
  url: string;
  /** ISO timestamp, or `''` if the server did not say. */
  urlExpiresAt: string;
}

/** Domain shape used throughout the chat feature. */
export interface ChatMessage {
  /** Server id, null until the message has been stored. */
  id: string | null;
  documentId: string;
  userId: string;
  /** May be empty when the message carries attachments. */
  body: string;
  /**
   * The idempotency key the client chose. Every message carries one — the send
   * route requires it and the history route returns it — so it doubles as the
   * stable identity a message keeps from the optimistic send through to its
   * stored form, which is what dedupes an echo against the local copy.
   */
  clientMsgId: string;
  /** ISO timestamp, or `''` for a message not yet acknowledged by the server. */
  createdAt: string;
  /** Photos and videos, in display order. */
  attachments: ChatAttachment[];
}

export type ChatMessageStatus = 'sending' | 'sent' | 'failed';

/** A message as the list renders it: a domain message plus local send state. */
export interface ChatMessageView extends ChatMessage {
  status: ChatMessageStatus;
  /**
   * Monotonic local arrival order. Breaks ties when two messages share a
   * timestamp, and keeps a still-sending message (no server time yet) in a
   * stable spot at the foot of the list.
   */
  localSeq: number;
}

function kindOf(dto: ChatAttachmentDto): ChatAttachmentKind {
  if (dto.kind === 'video' || dto.kind === 'image') return dto.kind;
  return (dto.content_type ?? '').startsWith('video/') ? 'video' : 'image';
}

export function mapChatAttachment(dto: ChatAttachmentDto): ChatAttachment {
  return {
    id: dto.id ?? '',
    kind: kindOf(dto),
    contentType: dto.content_type ?? '',
    filename: dto.filename ?? '',
    sizeBytes: typeof dto.size_bytes === 'number' ? dto.size_bytes : 0,
    url: dto.url ?? '',
    urlExpiresAt: dto.url_expires_at ?? '',
  };
}

export function mapChatMessage(dto: ChatMessageDto): ChatMessage {
  // Fall back to the server id as the dedupe key for a message that somehow
  // arrived without a client id — a malformed frame rather than the norm.
  const clientMsgId = dto.client_msg_id ?? dto.id ?? '';

  return {
    id: dto.id ?? null,
    documentId: dto.document_id ?? '',
    userId: dto.user_id ?? '',
    body: dto.body ?? '',
    clientMsgId,
    createdAt: dto.created_at ?? '',
    attachments: Array.isArray(dto.attachments)
      ? dto.attachments.map(mapChatAttachment).filter((attachment) => attachment.id)
      : [],
  };
}

/**
 * Reads a chat message out of an inbound `chat:message` socket frame.
 *
 * The frame's exact shape is not pinned down by the API, so this is tolerant:
 * the message may be the frame itself (flat, beside the `type`) or nested under
 * a `message`/`msg`/`data` field. A frame with neither a body nor attachments,
 * or without any identity to dedupe on, is rejected rather than rendered as an
 * empty line.
 */
export function chatMessageFromFrame(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const nested = [obj.message, obj.msg, obj.data].find(
    (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object',
  );
  const candidate = (nested ?? obj) as ChatMessageDto;

  const { body, client_msg_id: clientMsgId, id, attachments } = candidate;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (typeof body !== 'string' && !hasAttachments) return null;
  if (typeof clientMsgId !== 'string' && typeof id !== 'string') return null;

  const message = mapChatMessage(candidate);
  return message.body || message.attachments.length > 0 ? message : null;
}
