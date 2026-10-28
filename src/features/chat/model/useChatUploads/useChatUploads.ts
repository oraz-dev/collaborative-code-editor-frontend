import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '@/shared/api';
import { logger } from '@/shared/lib/logger/logger';
import type { UploadOptions } from '../api/chatApi';
import { CHAT_MAX_ATTACHMENTS } from '../consts/chatMedia';
import { isRememberedPreview, rememberLocalPreview } from '../lib/localMediaPreviews/localMediaPreviews';
import { validateChatMedia } from '../lib/validateChatMedia/validateChatMedia';
import type { ChatAttachment, ChatAttachmentKind } from '../types/chatMessage';

export type PendingUploadStatus = 'uploading' | 'done' | 'error';

export interface PendingUpload {
  key: string;
  file: File;
  kind: ChatAttachmentKind;
  /** Blob url of the local file, for the tray thumbnail. */
  previewUrl: string;
  /** 0–1. */
  progress: number;
  status: PendingUploadStatus;
  error: string | null;
  attachment: ChatAttachment | null;
}

export type UploadFn = (file: File, options?: UploadOptions) => Promise<ChatAttachment>;

export interface ChatUploads {
  items: PendingUpload[];
  /** Why some picked files were turned away; cleared after a few seconds. */
  notice: string | null;
  dismissNotice: () => void;
  isUploading: boolean;
  hasErrors: boolean;
  /** Room left in this message. */
  room: number;
  add: (files: readonly File[]) => void;
  remove: (key: string) => void;
  retry: (key: string) => void;
  /**
   * Runs `send` as soon as every upload has finished — straight away if none
   * is running. Called again before then, it just replaces what will run.
   * Dropped if an upload fails, so the failure is dealt with first.
   */
  sendWhenReady: (send: () => void) => void;
  /** A send is waiting on uploads. */
  isQueued: boolean;
  /** Hands over the finished attachments, in order, and empties the tray. */
  take: () => ChatAttachment[];
}

const NOTICE_MS = 8_000;
let keySeq = 0;

function describeError(error: unknown): string {
  if (isApiError(error)) return error.message;
  return 'Upload failed. Retry in a moment.';
}

/**
 * The composer's tray of photos and videos. Each one starts uploading the
 * moment it is picked, so by the time the message is written it is usually
 * already there.
 *
 * State lives in a ref that every change goes through, because the "send
 * when ready" check has to see the latest tray from inside upload callbacks.
 */
export function useChatUploads(upload: UploadFn): ChatUploads {
  const [items, setItems] = useState<PendingUpload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isQueued, setIsQueued] = useState(false);
  const itemsRef = useRef<PendingUpload[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());
  const queuedRef = useRef<(() => void) | null>(null);

  const settleQueue = useCallback(() => {
    const send = queuedRef.current;
    if (!send) return;
    const current = itemsRef.current;
    if (current.some((item) => item.status === 'uploading')) return;
    queuedRef.current = null;
    setIsQueued(false);
    if (!current.some((item) => item.status === 'error')) send();
  }, []);

  const commit = useCallback((next: PendingUpload[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (key: string, change: Partial<PendingUpload>) => {
      commit(itemsRef.current.map((item) => (item.key === key ? { ...item, ...change } : item)));
    },
    [commit],
  );

  const start = useCallback(
    (item: PendingUpload) => {
      const controller = new AbortController();
      controllersRef.current.set(item.key, controller);
      let lastPaint = 0;

      upload(item.file, {
        signal: controller.signal,
        onProgress: (fraction) => {
          // Progress events can fire hundreds of times a second.
          const now = performance.now();
          if (now - lastPaint < 60 && fraction < 1) return;
          lastPaint = now;
          patch(item.key, { progress: fraction });
        },
      })
        .then((attachment) => {
          if (controller.signal.aborted) return;
          rememberLocalPreview(attachment.id, item.previewUrl);
          patch(item.key, { status: 'done', progress: 1, attachment, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          logger.warn('Chat upload failed', error);
          patch(item.key, { status: 'error', error: describeError(error) });
        })
        .finally(() => {
          if (controllersRef.current.get(item.key) === controller) controllersRef.current.delete(item.key);
          settleQueue();
        });
    },
    [patch, settleQueue, upload],
  );

  const add = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return;
      const { accepted, rejected } = validateChatMedia(files, CHAT_MAX_ATTACHMENTS - itemsRef.current.length);
      setNotice(rejected.length > 0 ? rejected.join(' ') : null);

      const added = accepted.map(({ file, kind }): PendingUpload => {
        keySeq += 1;
        return {
          key: `upload-${keySeq}`,
          file,
          kind,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'uploading',
          error: null,
          attachment: null,
        };
      });
      if (added.length === 0) return;
      commit([...itemsRef.current, ...added]);
      added.forEach(start);
    },
    [commit, start],
  );

  const remove = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((entry) => entry.key === key);
      if (!item) return;
      controllersRef.current.get(key)?.abort();
      controllersRef.current.delete(key);
      if (!isRememberedPreview(item.previewUrl)) URL.revokeObjectURL(item.previewUrl);
      commit(itemsRef.current.filter((entry) => entry.key !== key));
      settleQueue();
    },
    [commit, settleQueue],
  );

  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((entry) => entry.key === key);
      if (!item || item.status !== 'error') return;
      const restarted: PendingUpload = { ...item, status: 'uploading', progress: 0, error: null };
      commit(itemsRef.current.map((entry) => (entry.key === key ? restarted : entry)));
      start(restarted);
    },
    [commit, start],
  );

  const sendWhenReady = useCallback(
    (send: () => void) => {
      queuedRef.current = send;
      setIsQueued(true);
      settleQueue();
    },
    [settleQueue],
  );

  const take = useCallback((): ChatAttachment[] => {
    const ready = itemsRef.current
      .map((item) => item.attachment)
      .filter((attachment): attachment is ChatAttachment => attachment !== null);
    // The blobs behind sent attachments live on as their previews.
    itemsRef.current.forEach((item) => {
      if (!isRememberedPreview(item.previewUrl)) URL.revokeObjectURL(item.previewUrl);
    });
    commit([]);
    return ready;
  }, [commit]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Leaving the document (or closing the chat) abandons whatever was in flight.
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      queuedRef.current = null;
      itemsRef.current.forEach((item) => {
        if (!isRememberedPreview(item.previewUrl)) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  return {
    items,
    notice,
    dismissNotice,
    isUploading: items.some((item) => item.status === 'uploading'),
    hasErrors: items.some((item) => item.status === 'error'),
    room: CHAT_MAX_ATTACHMENTS - items.length,
    add,
    remove,
    retry,
    sendWhenReady,
    isQueued,
    take,
  };
}
