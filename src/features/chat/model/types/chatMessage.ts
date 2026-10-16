/** Wire shape of a chat message (snake_case), from REST and the socket alike. */
export interface ChatMessageDto {
  id?: string;
  document_id?: string;
  user_id?: string;
  body?: string;
  client_msg_id?: string;
  created_at?: string;
}

/** Domain shape used throughout the chat feature. */
export interface ChatMessage {
  /** Server id, null until the message has been stored. */
  id: string | null;
  documentId: string;
  userId: string;
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
  };
}

/**
 * Reads a chat message out of an inbound `chat:message` socket frame.
 *
 * The frame's exact shape is not pinned down by the API, so this is tolerant:
 * the message may be the frame itself (flat, beside the `type`) or nested under
 * a `message`/`msg`/`data` field. A frame without a body, or without any
 * identity to dedupe on, is rejected rather than rendered as an empty line.
 */
export function chatMessageFromFrame(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const nested = [obj.message, obj.msg, obj.data].find(
    (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object',
  );
  const candidate = nested ?? obj;

  const { body, client_msg_id: clientMsgId, id } = candidate as ChatMessageDto;
  if (typeof body !== 'string') return null;
  if (typeof clientMsgId !== 'string' && typeof id !== 'string') return null;

  return mapChatMessage(candidate as ChatMessageDto);
}
