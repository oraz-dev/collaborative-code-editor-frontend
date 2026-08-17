import { describe, expect, test } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64', () => {
  test('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 255, 7, 64]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  test('matches the encoding the backend returns for yjs state', () => {
    // verified against the live /yjs-state endpoint
    expect(bytesToBase64(new Uint8Array([1, 255, 200, 0, 7, 128, 64]))).toBe('Af/IAAeAQA==');
  });

  test('survives bytes that are not valid UTF-8', () => {
    // the whole reason the collaboration socket encodes: a raw 0xFF would
    // disconnect peers when the relay stringifies the frame
    const bytes = new Uint8Array([0xff, 0xfe, 0xc0, 0x80]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  test('handles an empty payload', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array([]));
  });

  test('handles payloads larger than one chunk', () => {
    const large = new Uint8Array(70_000);
    for (let i = 0; i < large.length; i += 1) large[i] = i % 256;
    expect(base64ToBytes(bytesToBase64(large))).toEqual(large);
  });
});
