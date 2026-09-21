import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import { trackPendingWrite } from '@/shared/lib/pendingWrites/pendingWrites';
import { describeLoadError, useProjectLoader } from './useProjectLoader';

const api = vi.hoisted(() => ({
  fetchDocument: vi.fn(),
  fetchChildDocuments: vi.fn(),
  fetchRootDocuments: vi.fn(),
}));

vi.mock('@/entities/Document', () => api);

const ROOT = { id: 'root', parentId: null, name: 'proj', kind: 'folder' as const, content: '' };
const OPEN = { id: 'main', parentId: 'root', name: 'main.js', kind: 'file' as const, content: 'saved' };
const UTIL = { id: 'util', parentId: 'root', name: 'util.js', kind: 'file' as const, content: 'v1' };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useProjectLoader(), { wrapper }) };
}

beforeEach(() => {
  api.fetchDocument.mockReset().mockResolvedValue(ROOT);
  api.fetchChildDocuments.mockReset().mockResolvedValue([OPEN, UTIL]);
  api.fetchRootDocuments.mockReset().mockResolvedValue([]);
});

describe('useProjectLoader', () => {
  test('goes loading, then ready with the project', async () => {
    const { result } = setup();

    act(() => {
      void result.current.load(OPEN, 'live');
    });
    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const { state } = result.current;
    expect(state.status === 'ready' && state.project.files).toEqual([
      { path: 'main.js', content: 'live' },
      { path: 'util.js', content: 'v1' },
    ]);
  });

  test('waits for a save still in flight before reading the other files', async () => {
    // util.js was edited, then left: its flush is a PUT nobody else awaits.
    let saved = 'v1';
    let finishSave: () => void = () => undefined;
    trackPendingWrite(new Promise<void>((resolve) => {
      finishSave = () => {
        saved = 'v2';
        resolve();
      };
    }));
    api.fetchChildDocuments.mockImplementation(async () => [OPEN, { ...UTIL, content: saved }]);
    const { result } = setup();

    act(() => {
      void result.current.load(OPEN, 'live');
    });
    await Promise.resolve();
    expect(api.fetchChildDocuments).not.toHaveBeenCalled();

    act(() => finishSave());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const { state } = result.current;
    expect(state.status === 'ready' && state.project.files[1].content).toBe('v2');
  });

  test('fetches file contents fresh on every run', async () => {
    const { result } = setup();

    await act(() => result.current.load(OPEN, ''));
    api.fetchChildDocuments.mockResolvedValue([OPEN, { ...UTIL, content: 'v2' }]);
    await act(() => result.current.load(OPEN, ''));

    const { state } = result.current;
    expect(state.status === 'ready' && state.project.files[1].content).toBe('v2');
    expect(api.fetchChildDocuments).toHaveBeenCalledTimes(2);
  });

  test('takes an ancestor from the cache when it has one', async () => {
    const { result, client } = setup();
    client.setQueryData(queryKeys.document('root'), ROOT);

    await act(() => result.current.load(OPEN, ''));

    expect(api.fetchDocument).not.toHaveBeenCalled();
    const { state } = result.current;
    expect(state.status === 'ready' && state.project.rootName).toBe('proj');
  });

  test('reports a failed load instead of swallowing it', async () => {
    api.fetchChildDocuments.mockRejectedValue(new Error('Could not reach the server.'));
    const { result } = setup();

    await act(() => result.current.load(OPEN, ''));

    expect(result.current.state).toEqual({
      status: 'error',
      message: describeLoadError(new Error('Could not reach the server.')),
    });
  });

  test('a second run cancels the first, whose late answer is ignored', async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    const signals: AbortSignal[] = [];
    api.fetchChildDocuments
      .mockImplementationOnce((_id: string, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise((resolve) => {
          releaseFirst = resolve;
        });
      })
      .mockImplementationOnce(async (_id: string, signal: AbortSignal) => {
        signals.push(signal);
        return [OPEN];
      });
    const { result } = setup();

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.load(OPEN, 'first');
    });
    await waitFor(() => expect(signals).toHaveLength(1));
    await act(() => result.current.load(OPEN, 'second'));

    expect(signals[0].aborted).toBe(true);

    await act(async () => {
      releaseFirst([OPEN, UTIL]);
      await first;
    });

    const { state } = result.current;
    expect(state.status === 'ready' && state.project.files).toEqual([
      { path: 'main.js', content: 'second' },
    ]);
  });

  test('aborts an in-flight load on unmount', async () => {
    const signals: AbortSignal[] = [];
    api.fetchChildDocuments.mockImplementation((_id: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { result, unmount } = setup();

    act(() => {
      void result.current.load(OPEN, '');
    });
    await waitFor(() => expect(signals).toHaveLength(1));
    unmount();

    expect(signals[0].aborted).toBe(true);
  });

  test('cancel abandons a load in flight and leaves no spinner behind', async () => {
    const signals: AbortSignal[] = [];
    api.fetchChildDocuments.mockImplementation((_id: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { result } = setup();

    act(() => {
      void result.current.load(OPEN, '');
    });
    await waitFor(() => expect(signals).toHaveLength(1));
    act(() => result.current.cancel());

    expect(signals[0].aborted).toBe(true);
    expect(result.current.state).toEqual({ status: 'idle' });
  });
});
