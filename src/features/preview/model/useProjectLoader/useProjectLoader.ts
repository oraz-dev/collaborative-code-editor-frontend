import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api';
import { settlePendingWrites } from '@/shared/lib/pendingWrites/pendingWrites';
import {
  fetchChildDocuments,
  fetchDocument,
  fetchRootDocuments,
} from '@/entities/Document';
import {
  isAbortError,
  loadProject,
  type LoadedProject,
  type ProjectDocument,
  type ProjectFetchers,
} from '../loadProject/loadProject';

export type ProjectLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; project: LoadedProject }
  | { status: 'error'; message: string };

/**
 * A folder's name and parent change rarely, and an ancestor lookup is repeated
 * on every Run — so it may come from the cache for this long. File contents
 * never do: they are what runs.
 */
const ANCESTOR_STALE_MS = 5 * 60_000;

/**
 * How a project load reaches the document service: ancestors through the
 * cache, folder contents fresh.
 */
export function useProjectFetchers(): ProjectFetchers {
  const queryClient = useQueryClient();

  return useMemo((): ProjectFetchers => ({
    fetchDocument: (id) => queryClient.fetchQuery({
      queryKey: queryKeys.document(id),
      queryFn: ({ signal }) => fetchDocument(id, signal),
      staleTime: ANCESTOR_STALE_MS,
      // A 403 is an answer here, not a fault to back off from; and the app's
      // default 'online' mode would park the Run indefinitely while offline.
      retry: false,
      networkMode: 'always',
    }),
    // Straight to the service, bypassing the cache: a saved edit to a file
    // you are not looking at must show up on the next Run. "Saved" is the
    // limit — a teammate's edit reaches the server once their editor has
    // been idle for a moment, and not before.
    fetchChildren: (folderId, signal) => fetchChildDocuments(folderId, signal),
    fetchRoots: (signal) => fetchRootDocuments(signal),
  }), [queryClient]);
}

/**
 * Loads the open file's project for the preview, one load at a time.
 *
 * Starting a load aborts the one before it, so pressing Run twice cannot let a
 * slow first walk land on top of the second; unmounting aborts too. A load
 * that fails for any reason other than being cancelled ends in `error` with a
 * message for the pane — never silently in the previous project.
 */
export function useProjectLoader() {
  const fetchers = useProjectFetchers();
  const [state, setState] = useState<ProjectLoadState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);

  /**
   * Abandons the load in flight, if any. The state goes back to idle with it:
   * an aborted load never settles itself, so leaving `loading` behind would
   * show a spinner for a load nobody is running.
   */
  const cancel = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.abort();
    controllerRef.current = null;
    setState({ status: 'idle' });
  }, []);

  const load = useCallback(async (document: ProjectDocument, liveContent: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading' });

    try {
      // Other files are read from the server's saved copy. A save of one just
      // edited (flushed when its tab was left) may still be in flight; wait
      // for it, or the Run would overtake it and run the old text.
      await settlePendingWrites();
      if (controller.signal.aborted) return;
      const project = await loadProject({
        document, liveContent, fetchers, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setState({ status: 'ready', project });
    } catch (error) {
      // A newer load owns the state now; this one has nothing to report.
      if (controller.signal.aborted || isAbortError(error)) return;
      setState({ status: 'error', message: describeLoadError(error) });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [fetchers]);

  useEffect(() => cancel, [cancel]);

  return { state, load, cancel };
}

export function describeLoadError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Could not load the project: ${detail}`;
}
