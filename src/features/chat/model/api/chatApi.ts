import { docsHttp } from '@/shared/api';
import { mapChatMessage, type ChatMessage, type ChatMessageDto } from '../types/chatMessage';

export interface FetchChatOptions {
  /** Opaque cursor from a previous page's `nextCursor`; omit for the newest page. */
  before?: string | null;
  /** Page size, 1–100 (the server caps larger values at 100). */
  limit?: number;
  signal?: AbortSignal;
}

export interface ChatPage {
  /** Oldest-first within the page, so it renders top to bottom as-is. */
  messages: ChatMessage[];
  /** Cursor for the page of older messages; null once there are none. */
  nextCursor: string | null;
}

/**
 * One page of a document's chat history, newest page first. Pages walk
 * backwards: pass a response's `nextCursor` back as `before` for the older page.
 */
export async function fetchChatMessages(
  documentId: string,
  options: FetchChatOptions = {},
): Promise<ChatPage> {
  const params = new URLSearchParams();
  if (options.before) params.set('before', options.before);
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();

  const data = await docsHttp<{ messages?: ChatMessageDto[]; next_cursor?: string | null }>(
    `/documents/${documentId}/chat/messages${query ? `?${query}` : ''}`,
    { method: 'GET', signal: options.signal },
  );

  return {
    messages: (data?.messages ?? []).map(mapChatMessage),
    nextCursor: data?.next_cursor ?? null,
  };
}

/**
 * Stores a chat message over REST. The fallback for when the socket is not
 * open — `client_msg_id` makes it idempotent, so resending the same one after
 * a timeout returns the stored message rather than posting a duplicate.
 */
export async function postChatMessage(
  documentId: string,
  input: { body: string; clientMsgId: string },
): Promise<ChatMessage> {
  const dto = await docsHttp<ChatMessageDto>(`/documents/${documentId}/chat/messages`, {
    method: 'POST',
    body: { body: input.body, client_msg_id: input.clientMsgId },
  });

  return mapChatMessage(dto);
}
