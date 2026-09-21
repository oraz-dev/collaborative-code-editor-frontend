import { useEffect, useState } from 'react';
import { logger } from '@/shared/lib/logger/logger';
import { isAbortError, loadProject, type LoadedProject, type ProjectDocument } from '../loadProject/loadProject';
import { useProjectFetchers } from '../useProjectLoader/useProjectLoader';

export interface ProjectSnapshot extends LoadedProject {
  /** The document it was loaded around, so a snapshot of the last file is never mistaken for this one's. */
  documentId: string;
}

/**
 * The project around the open file, loaded once each time a file is opened —
 * for the editor's type checker, which needs to see the files the open one
 * imports. Unlike a Run it does not wait on saves in flight: a type hint a
 * moment behind is harmless, a delayed editor is not.
 *
 * `liveContent` is read when the load starts; the open file itself is the
 * editor's model, so its entry here only matters for what it imports.
 */
export function useProjectSnapshot(
  document: ProjectDocument | null,
  liveContent: () => string,
  enabled: boolean,
): ProjectSnapshot | null {
  const fetchers = useProjectFetchers();
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const documentId = document?.id ?? null;
  const readContent = liveContent;

  useEffect(() => {
    if (!enabled || !document) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        const project = await loadProject({
          document,
          liveContent: readContent(),
          fetchers,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setSnapshot({ ...project, documentId: document.id });
      } catch (error) {
        // No project is not an error for the editor: it type-checks the file
        // on its own, as it did before projects existed.
        if (!controller.signal.aborted && !isAbortError(error)) {
          logger.warn('Could not load the project for type checking', error);
        }
      }
    };
    void load();

    return () => controller.abort();
    // Reloaded per file opened, not per keystroke: `document` changes identity
    // when its content is refetched, and `readContent` with every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, enabled, fetchers]);

  return snapshot && snapshot.documentId === documentId ? snapshot : null;
}
