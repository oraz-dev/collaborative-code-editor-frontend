/**
 * Blob urls for files this tab uploaded, by attachment id. The sender's own
 * photo shows from the file already on disk — instantly, with no round trip —
 * rather than flashing blank while the signed link loads.
 *
 * Blob urls point at the file on disk, not a copy in memory, so keeping them
 * for the session costs nothing worth reclaiming.
 */
const previews = new Map<string, string>();

export function rememberLocalPreview(attachmentId: string, blobUrl: string): void {
  if (attachmentId && blobUrl) previews.set(attachmentId, blobUrl);
}

export function localPreviewFor(attachmentId: string): string | undefined {
  return previews.get(attachmentId);
}

export function isRememberedPreview(blobUrl: string): boolean {
  for (const url of previews.values()) if (url === blobUrl) return true;
  return false;
}
