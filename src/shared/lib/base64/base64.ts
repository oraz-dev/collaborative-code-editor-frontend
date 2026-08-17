/**
 * Byte <-> base64 helpers.
 *
 * Needed in two places that both deal with binary Yjs data over JSON/text
 * transports: the persisted CRDT state (`/yjs-state` returns base64) and the
 * collaboration socket (which relays text frames only).
 *
 * Chunked to stay clear of the argument-count limit on large updates.
 */
const CHUNK_SIZE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
