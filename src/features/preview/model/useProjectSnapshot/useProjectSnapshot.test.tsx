import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectDocument } from '../loadProject/loadProject';
import { useProjectSnapshot } from './useProjectSnapshot';

const api = vi.hoisted(() => ({
  fetchDocument: vi.fn(),
  fetchChildDocuments: vi.fn(),
  fetchRootDocuments: vi.fn(),
}));

vi.mock('@/entities/Document', () => api);

const ROOT = { id: 'root', parentId: null, name: 'proj', kind: 'folder' as const, content: '' };
const APP = { id: 'app', parentId: 'root', name: 'App.tsx', kind: 'file' as const, content: 'saved' };
const UTIL = { id: 'util', parentId: 'root', name: 'util.ts', kind: 'file' as const, content: 'util' };

function setup(initial: { document: ProjectDocument | null; enabled: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ document, enabled }) => useProjectSnapshot(document, () => 'live', enabled),
    { wrapper, initialProps: initial },
  );
}

beforeEach(() => {
  api.fetchDocument.mockReset().mockResolvedValue(ROOT);
  api.fetchChildDocuments.mockReset().mockResolvedValue([APP, UTIL]);
  api.fetchRootDocuments.mockReset().mockResolvedValue([]);
});

describe('useProjectSnapshot', () => {
  test('loads the project around the open file, with its live text', async () => {
    const { result } = setup({ document: APP, enabled: true });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.files).toEqual([
      { path: 'App.tsx', content: 'live' },
      { path: 'util.ts', content: 'util' },
    ]);
    expect(result.current?.rootId).toBe('root');
  });

  test('does nothing for a file the type checker does not read', () => {
    const { result } = setup({ document: APP, enabled: false });

    expect(result.current).toBeNull();
    expect(api.fetchChildDocuments).not.toHaveBeenCalled();
  });

  test('never hands out the last file’s snapshot for the next one', async () => {
    const { result, rerender } = setup({ document: APP, enabled: true });
    await waitFor(() => expect(result.current).not.toBeNull());

    api.fetchChildDocuments.mockReturnValue(new Promise(() => undefined));
    rerender({ document: UTIL, enabled: true });

    expect(result.current).toBeNull();
  });

  test('a failed load leaves the editor on its own, without throwing', async () => {
    api.fetchChildDocuments.mockRejectedValue(new Error('offline'));
    const { result } = setup({ document: APP, enabled: true });

    await waitFor(() => expect(api.fetchChildDocuments).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
