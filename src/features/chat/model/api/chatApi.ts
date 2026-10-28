import {
  ApiError,
  DOCS_BASE_URL,
  docsHttp,
  refreshAccessToken,
  tokenStore,
} from '@/shared/api';
import {
  mapChatAttachment,
  mapChatMessage,
  type ChatAttachment,
  type ChatAttachmentDto,
  type ChatMessage,
  type ChatMessageDto,
} from '../types/chatMessage';

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
  input: { body: string; clientMsgId: string; attachmentIds?: readonly string[] },
): Promise<ChatMessage> {
  const dto = await docsHttp<ChatMessageDto>(`/documents/${documentId}/chat/messages`, {
    method: 'POST',
    body: {
      body: input.body,
      client_msg_id: input.clientMsgId,
      ...(input.attachmentIds && input.attachmentIds.length > 0 ? { attachment_ids: input.attachmentIds } : {}),
    },
  });

  return mapChatMessage(dto);
}

export interface UploadOptions {
  /** 0–1 as the bytes go out. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const UPLOAD_ERRORS: Record<number, string> = {
  403: 'You no longer have access to this document.',
  413: 'That file is over the size limit (photos 20 MB, videos 100 MB).',
  415: 'That file isn’t a supported photo or video.',
  429: 'Uploading too quickly. Wait a moment, then retry.',
  501: 'Photo and video sharing isn’t turned on for this server.',
};

function uploadError(status: number, payload: unknown): ApiError {
  const serverText = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
    ? (payload as { error: string }).error
    : '';
  return new ApiError({
    kind: status === 0 ? 'network' : 'http',
    status,
    payload,
    message: UPLOAD_ERRORS[status]
      ?? (status === 0 ? 'Upload failed. Check your connection, then retry.' : serverText || 'Upload failed. Retry in a moment.'),
  });
}

function sendUpload(url: string, file: File, token: string | null, options: UploadOptions): Promise<{ status: number; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file, file.name);

    const onAbort = () => xhr.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });

    xhr.open('POST', url);
    xhr.withCredentials = true;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      options.signal?.removeEventListener('abort', onAbort);
      let payload: unknown;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = xhr.responseText;
      }
      resolve({ status: xhr.status, payload });
    };
    xhr.onerror = () => {
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ status: 0, payload: null });
    };
    xhr.onabort = () => {
      options.signal?.removeEventListener('abort', onAbort);
      reject(new ApiError({ kind: 'aborted', message: 'Upload cancelled' }));
    };
    xhr.send(form);
  });
}

/**
 * Step one of sending a photo or video: stores the file and returns it, signed
 * url and all, so the sender can show it straight away. XHR rather than fetch
 * because fetch cannot report upload progress.
 */
export async function uploadChatAttachment(
  documentId: string,
  file: File,
  options: UploadOptions = {},
): Promise<ChatAttachment> {
  const url = `${DOCS_BASE_URL}/documents/${documentId}/chat/attachments`;

  let result = await sendUpload(url, file, tokenStore.get(), options);
  if (result.status === 401) {
    const token = await refreshAccessToken();
    if (token) result = await sendUpload(url, file, token, options);
  }

  if (result.status < 200 || result.status >= 300) throw uploadError(result.status, result.payload);
  return mapChatAttachment((result.payload ?? {}) as ChatAttachmentDto);
}

/**
 * The server's signed urls are relative to its own origin. When the API is
 * served same-origin (the deployed app, the dev proxy) that is already right;
 * a cross-origin API base needs its origin put in front.
 */
export function resolveAttachmentUrl(url: string): string {
  if (!url || /^[a-z]+:/i.test(url) || !url.startsWith('/')) return url;
  try {
    const base = new URL(DOCS_BASE_URL, window.location.href);
    return base.origin === window.location.origin ? url : `${base.origin}${url}`;
  } catch {
    return url;
  }
}
