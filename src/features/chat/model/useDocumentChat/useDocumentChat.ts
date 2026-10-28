import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '@/shared/api';
import { logger } from '@/shared/lib/logger/logger';
import {
  fetchChatMessages,
  postChatMessage,
  uploadChatAttachment,
  type UploadOptions,
} from '../api/chatApi';
import { mergeMessages } from '../lib/mergeMessages/mergeMessages';
import {
  chatMessageFromFrame,
  type ChatAttachment,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatMessageView,
} from '../types/chatMessage';

/** How many messages a history page asks for. */
const PAGE_SIZE = 50;

/**
 * How long to wait for the server to echo a message sent over the socket
 * before confirming it over REST instead. The relay offers no delivery
 * guarantee, so a message whose echo never arrives would otherwise sit as
 * "sending" forever; the REST resend is idempotent on `client_msg_id`.
 */
const WS_CONFIRM_TIMEOUT_MS = 5_000;

/** Renew signed media links this long before the earliest one lapses. */
const MEDIA_REFRESH_LEAD_MS = 5 * 60_000;

/** At most one media refresh this often, however many images fail at once. */
const MEDIA_REFRESH_MIN_GAP_MS = 20_000;

/** The slice of the collaboration socket the chat needs. Stable across renders. */
export interface ChatTransport {
  sendChat: (body: string, clientMsgId: string, attachmentIds?: readonly string[]) => boolean;
  subscribeChat: (listener: (raw: Record<string, unknown>) => void) => () => void;
}

export interface UseDocumentChatOptions {
  documentId: string | null | undefined;
  /** The signed-in user — their id tags outgoing messages. */
  selfUserId: string | null;
  transport: ChatTransport;
  enabled?: boolean;
}

export interface DocumentChat {
  messages: ChatMessageView[];
  /** The first page of history is still loading. */
  isLoading: boolean;
  /** History could not be loaded; sending still works. */
  error: Error | null;
  /** Older messages remain to be fetched. */
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  /**
   * Posts a message with any photos or videos already uploaded through
   * `upload`. Ignored when there is neither text nor an attachment.
   */
  send: (body: string, attachments?: readonly ChatAttachment[]) => void;
  /** Uploads one photo or video for a message about to be sent. */
  upload: (file: File, options?: UploadOptions) => Promise<ChatAttachment>;
  /**
   * Reloads the loaded history for fresh signed media links — they expire
   * after a few hours. Safe to call often: it runs at most every few seconds.
   */
  refreshMedia: () => void;
  /** Resends a message that failed, reusing its id so it cannot duplicate. */
  retry: (clientMsgId: string) => void;
}

const NO_MESSAGES: ChatMessageView[] = [];

const newClientMsgId = (): string =>
  // randomUUID is available in every browser this app targets; the fallback is
  // only for a non-secure test context where it is undefined.
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cmid-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useDocumentChat(options: UseDocumentChatOptions): DocumentChat {
  const { documentId, selfUserId, transport, enabled = true } = options;
  const active = Boolean(documentId) && enabled;

  const [messages, setMessages] = useState<ChatMessageView[]>(NO_MESSAGES);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  // Which document the state above belongs to. Opening a different one resets
  // the view during render — React's own answer to "reset state when a prop
  // changes" — so the loading effect only ever does the fetch, never a reset.
  // `undefined` before the first active document means the first one resets too.
  const [loadedDocId, setLoadedDocId] = useState<string | null | undefined>(undefined);
  if (active && documentId !== loadedDocId) {
    setLoadedDocId(documentId);
    setMessages(NO_MESSAGES);
    setCursor(null);
    setError(null);
    setIsLoading(true);
  }

  // Monotonic arrival counter, so two messages that share a timestamp keep a
  // stable order. Never reset — only relative order matters.
  const seqRef = useRef(0);
  const nextSeq = () => {
    seqRef.current += 1;
    return seqRef.current;
  };

  // Read by callbacks that must not be rebuilt per message (the retry lookup).
  const messagesRef = useRef<ChatMessageView[]>(NO_MESSAGES);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // client ids whose stored form has been seen (echo or REST), so the socket
  // timeout knows not to resend them.
  const confirmedRef = useRef(new Set<string>());
  // How many history pages are loaded, so a media refresh reloads all of them.
  const pagesRef = useRef(0);
  const refreshingRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const docIdRef = useRef(documentId);
  useEffect(() => {
    docIdRef.current = documentId;
  }, [documentId]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((clientMsgId: string) => {
    const timer = timersRef.current.get(clientMsgId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(clientMsgId);
    }
  }, []);

  const toView = useCallback(
    (message: ChatMessage, status: ChatMessageStatus): ChatMessageView => ({
      ...message,
      status,
      localSeq: nextSeq(),
    }),
    [],
  );

  const markFailed = useCallback((clientMsgId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.clientMsgId === clientMsgId && message.status === 'sending'
          ? { ...message, status: 'failed' }
          : message,
      ),
    );
  }, []);

  // --- delivery ----------------------------------------------------------

  const deliverOverRest = useCallback(
    async (clientMsgId: string, body: string, attachmentIds: readonly string[]) => {
      if (!documentId) return;
      clearTimer(clientMsgId);
      try {
        const stored = await postChatMessage(documentId, { body, clientMsgId, attachmentIds });
        confirmedRef.current.add(clientMsgId);
        setMessages((current) => mergeMessages(current, [toView(stored, 'sent')]));
      } catch (sendError) {
        logger.warn('Could not post a chat message', sendError);
        markFailed(clientMsgId);
      }
    },
    [clearTimer, documentId, markFailed, toView],
  );

  const deliver = useCallback(
    (clientMsgId: string, body: string, attachmentIds: readonly string[]) => {
      const sentOverSocket = transport.sendChat(body, clientMsgId, attachmentIds);

      if (!sentOverSocket) {
        // No open socket — go straight to REST rather than wait out a timeout.
        void deliverOverRest(clientMsgId, body, attachmentIds);
        return;
      }

      // Sent over the socket: wait for the server's echo to confirm it, and
      // fall back to REST if that echo never lands.
      clearTimer(clientMsgId);
      timersRef.current.set(
        clientMsgId,
        setTimeout(() => {
          timersRef.current.delete(clientMsgId);
          if (!confirmedRef.current.has(clientMsgId)) void deliverOverRest(clientMsgId, body, attachmentIds);
        }, WS_CONFIRM_TIMEOUT_MS),
      );
    },
    [clearTimer, deliverOverRest, transport],
  );

  const send = useCallback(
    (body: string, attachments: readonly ChatAttachment[] = []) => {
      const trimmed = body.trim();
      if ((!trimmed && attachments.length === 0) || !documentId) return;

      const clientMsgId = newClientMsgId();
      const optimistic = toView(
        {
          id: null,
          documentId,
          userId: selfUserId ?? '',
          body: trimmed,
          clientMsgId,
          createdAt: '',
          attachments: [...attachments],
        },
        'sending',
      );

      setMessages((current) => mergeMessages(current, [optimistic]));
      deliver(clientMsgId, trimmed, attachments.map((attachment) => attachment.id));
    },
    [deliver, documentId, selfUserId, toView],
  );

  const retry = useCallback(
    (clientMsgId: string) => {
      const target = messagesRef.current.find((message) => message.clientMsgId === clientMsgId);
      if (!target) return;

      setMessages((current) =>
        current.map((message) =>
          message.clientMsgId === clientMsgId ? { ...message, status: 'sending' } : message,
        ),
      );
      deliver(clientMsgId, target.body, target.attachments.map((attachment) => attachment.id));
    },
    [deliver],
  );

  const upload = useCallback(
    (file: File, uploadOptions?: UploadOptions): Promise<ChatAttachment> => {
      if (!documentId) return Promise.reject(new Error('No document is open'));
      return uploadChatAttachment(documentId, file, uploadOptions);
    },
    [documentId],
  );

  const refreshMedia = useCallback(() => {
    if (!documentId || refreshingRef.current) return;
    if (Date.now() - lastRefreshRef.current < MEDIA_REFRESH_MIN_GAP_MS) return;
    refreshingRef.current = true;
    lastRefreshRef.current = Date.now();

    const run = async () => {
      let before: string | null = null;
      const pages = Math.max(1, pagesRef.current);
      for (let index = 0; index < pages; index += 1) {
        const page = await fetchChatMessages(documentId, { before, limit: PAGE_SIZE });
        // The reader may have moved to another document while this ran.
        if (docIdRef.current !== documentId) return;
        // Fresh copies merge over the loaded ones, carrying new signed links.
        setMessages((current) => mergeMessages(current, page.messages.map((message) => toView(message, 'sent'))));
        before = page.nextCursor;
        if (!before) return;
      }
    };

    run()
      .catch((refreshError) => logger.warn('Could not refresh chat media links', refreshError))
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [documentId, toView]);

  const loadMore = useCallback(() => {
    if (!documentId || !cursor || isLoadingMore) return;

    setIsLoadingMore(true);
    fetchChatMessages(documentId, { before: cursor, limit: PAGE_SIZE })
      .then((page) => {
        setMessages((current) =>
          mergeMessages(
            page.messages.map((message) => toView(message, 'sent')),
            current,
          ),
        );
        setCursor(page.nextCursor);
        pagesRef.current += 1;
      })
      .catch((loadError) => {
        logger.warn('Could not load older chat messages', loadError);
      })
      .finally(() => setIsLoadingMore(false));
  }, [cursor, documentId, isLoadingMore, toView]);

  // --- history + live feed -----------------------------------------------

  // One effect per document: it subscribes to the socket (the external system
  // it synchronises React with) and loads the first page of history. The two
  // belong together — a message could arrive over the socket before, during or
  // after the history fetch, and merging by client id settles whichever order
  // they land in.
  useEffect(() => {
    // While inactive the stored state is simply not surfaced — the guard at the
    // end returns inert values — so there is nothing to set up here.
    if (!documentId || !enabled) return undefined;

    let disposed = false;
    const timers = timersRef.current;
    confirmedRef.current = new Set();
    pagesRef.current = 0;
    lastRefreshRef.current = 0;

    const unsubscribe = transport.subscribeChat((raw) => {
      const message = chatMessageFromFrame(raw);
      if (!message) return;
      // A frame for another document (a late one from a room just left) is not
      // ours to show. An omitted id is treated as a match rather than dropped.
      if (message.documentId && message.documentId !== documentId) return;

      confirmedRef.current.add(message.clientMsgId);
      setMessages((current) => mergeMessages(current, [toView(message, 'sent')]));
    });

    const controller = new AbortController();

    // The view was reset for this document during render; here we only load it.
    fetchChatMessages(documentId, { limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        if (disposed) return;
        // Keep any messages already sent or received live while this loaded.
        setMessages((current) =>
          mergeMessages(page.messages.map((message) => toView(message, 'sent')), current),
        );
        setCursor(page.nextCursor);
        pagesRef.current = 1;
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (disposed || controller.signal.aborted) return;
        // A fresh document simply has no history yet; that is not an error.
        if (isApiError(loadError) && loadError.isNotFound) {
          setIsLoading(false);
          return;
        }
        logger.warn('Could not load chat history', loadError);
        setError(loadError instanceof Error ? loadError : new Error('Failed to load chat'));
        setIsLoading(false);
      });

    return () => {
      disposed = true;
      unsubscribe();
      controller.abort();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [documentId, enabled, toView, transport]);

  // Renew signed media links shortly before the earliest one lapses, so a
  // chat left open all day never shows a broken photo.
  useEffect(() => {
    if (!active) return undefined;
    let earliest = Number.POSITIVE_INFINITY;
    messages.forEach((message) => {
      message.attachments.forEach((attachment) => {
        const expiresAt = Date.parse(attachment.urlExpiresAt);
        if (!Number.isNaN(expiresAt)) earliest = Math.min(earliest, expiresAt);
      });
    });
    if (!Number.isFinite(earliest)) return undefined;

    const delay = Math.max(MEDIA_REFRESH_MIN_GAP_MS, earliest - Date.now() - MEDIA_REFRESH_LEAD_MS);
    const timer = setTimeout(refreshMedia, delay);
    return () => clearTimeout(timer);
  }, [active, messages, refreshMedia]);

  if (!active) {
    return {
      messages: NO_MESSAGES,
      isLoading: false,
      error: null,
      hasMore: false,
      isLoadingMore: false,
      loadMore: () => {},
      send: () => {},
      retry: () => {},
      upload: () => Promise.reject(new Error('Chat is not available')),
      refreshMedia: () => {},
    };
  }

  return {
    messages,
    isLoading,
    error,
    hasMore: cursor !== null,
    isLoadingMore,
    loadMore,
    send,
    retry,
    upload,
    refreshMedia,
  };
}
