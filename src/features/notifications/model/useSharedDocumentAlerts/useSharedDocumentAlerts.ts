import { useEffect, useRef } from 'react';
import { useToast } from '@/shared/ui/Toast/toastContext';
import type { WorkspaceDocument } from '@/entities/Document';
import {
  readSeenShared,
  unseenDocuments,
  writeSeenShared,
} from '../seenDocuments/seenDocuments';

/** Beyond this, one summary line beats a wall of individual toasts. */
const MAX_INDIVIDUAL = 3;

/**
 * Announces documents that appeared in "shared with me" since this browser
 * last looked.
 *
 * There is no notification endpoint, so arrival is inferred from the shared
 * list itself: whatever is in it now that was not in it before is new. The
 * very first list this browser ever sees is recorded silently, so the alert
 * only ever fires for a share that genuinely happened while you were here.
 */
export function useSharedDocumentAlerts(
  documents: WorkspaceDocument[] | undefined,
  enabled = true,
): void {
  const { showToast } = useToast();
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled || !documents) return;

    if (seenRef.current === null) {
      const stored = readSeenShared();

      if (stored === null) {
        seenRef.current = new Set(documents.map((document) => document.id));
        writeSeenShared(seenRef.current);
        return;
      }
      seenRef.current = stored;
    }

    const seen = seenRef.current;
    const fresh = unseenDocuments(documents, seen);
    if (fresh.length === 0) return;

    fresh.forEach((document) => seen.add(document.id));
    writeSeenShared(seen);

    if (fresh.length > MAX_INDIVIDUAL) {
      showToast({
        variant: 'info',
        title: `${fresh.length} documents shared with you`,
        description: 'They are waiting under “Shared with me”.',
      });
      return;
    }

    fresh.forEach((document) => {
      showToast({
        variant: 'info',
        title: 'Shared with you',
        description: `${document.name} is now in your workspace.`,
      });
    });
  }, [documents, enabled, showToast]);
}
