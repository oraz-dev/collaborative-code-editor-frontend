import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { useChatUploads, type UploadFn } from './useChatUploads';
import type { ChatAttachment } from '../types/chatMessage';

function file(name: string, type = 'image/png'): File {
  return new File(['x'], name, { type });
}

function attachment(id: string): ChatAttachment {
  return { id, kind: 'image', contentType: 'image/png', filename: `${id}.png`, sizeBytes: 1, url: `/a/${id}`, urlExpiresAt: '' };
}

/** An upload whose outcome each test decides. */
function controllable() {
  const pending: { resolve: (a: ChatAttachment) => void; reject: (e: unknown) => void; file: File }[] = [];
  const upload: UploadFn = vi.fn(
    (f: File) => new Promise<ChatAttachment>((resolve, reject) => pending.push({ resolve, reject, file: f })),
  );
  return { upload, pending };
}

describe('useChatUploads', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  test('uploads each picked file straight away and hands them over in order', async () => {
    const { upload, pending } = controllable();
    const { result } = renderHook(() => useChatUploads(upload));

    act(() => result.current.add([file('a.png'), file('b.png')]));
    expect(result.current.items.map((item) => item.status)).toEqual(['uploading', 'uploading']);
    expect(result.current.isUploading).toBe(true);

    await act(async () => {
      pending[1].resolve(attachment('b'));
      pending[0].resolve(attachment('a'));
    });

    expect(result.current.isUploading).toBe(false);
    let taken: ChatAttachment[] = [];
    act(() => { taken = result.current.take(); });
    expect(taken.map((a) => a.id)).toEqual(['a', 'b']);
    expect(result.current.items).toEqual([]);
  });

  test('turns away unsupported files with a reason', () => {
    const { upload } = controllable();
    const { result } = renderHook(() => useChatUploads(upload));
    act(() => result.current.add([file('notes.pdf', 'application/pdf')]));
    expect(result.current.items).toEqual([]);
    expect(result.current.notice).toContain('notes.pdf');
  });

  test('a queued send waits for uploads, then runs once', async () => {
    const { upload, pending } = controllable();
    const { result } = renderHook(() => useChatUploads(upload));
    const send = vi.fn();

    act(() => result.current.add([file('a.png')]));
    act(() => result.current.sendWhenReady(send));
    expect(send).not.toHaveBeenCalled();
    expect(result.current.isQueued).toBe(true);

    await act(async () => pending[0].resolve(attachment('a')));
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.isQueued).toBe(false);
  });

  test('a failed upload shows why, drops the queued send, and can be retried', async () => {
    const { upload, pending } = controllable();
    const { result } = renderHook(() => useChatUploads(upload));
    const send = vi.fn();

    act(() => result.current.add([file('a.png')]));
    act(() => result.current.sendWhenReady(send));
    await act(async () => pending[0].reject(new ApiError({ kind: 'http', status: 429, message: 'Uploading too quickly.' })));

    expect(send).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({ status: 'error', error: 'Uploading too quickly.' });

    act(() => result.current.retry(result.current.items[0].key));
    expect(upload).toHaveBeenCalledTimes(2);
    await act(async () => pending[1].resolve(attachment('a')));
    expect(result.current.items[0].status).toBe('done');
  });

  test('removing a file cancels its upload', () => {
    const { upload } = controllable();
    const { result } = renderHook(() => useChatUploads(upload));
    act(() => result.current.add([file('a.png')]));
    const signal = (upload as ReturnType<typeof vi.fn>).mock.calls[0][1].signal as AbortSignal;

    act(() => result.current.remove(result.current.items[0].key));
    expect(signal.aborted).toBe(true);
    expect(result.current.items).toEqual([]);
  });
});
