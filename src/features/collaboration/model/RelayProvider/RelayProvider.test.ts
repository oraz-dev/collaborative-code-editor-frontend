import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { bytesToBase64 } from '@/shared/lib/base64/base64';
import { RelayProvider, type ConnectionStatus } from './RelayProvider';
import type { ControlFrame } from '../types/controlFrames';

/** Minimal stand-in for the browser WebSocket, capturing what gets sent. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  url: string;
  readyState = 0;
  sent: (ArrayBuffer | string)[] = [];
  binaryType = 'blob';

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer | string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: { canEdit?: boolean; onControlFrame?: (frame: ControlFrame) => void } = {}) {
  const { canEdit = true, onControlFrame } = options;
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const statuses: ConnectionStatus[] = [];

  const provider = new RelayProvider({
    documentId: 'doc-1',
    doc,
    awareness,
    mintTicket: vi.fn(async () => ({
      ticket: 'ticket-xyz',
      expiresInMs: 15_000,
      role: canEdit ? ('editor' as const) : ('viewer' as const),
      canEdit,
    })),
    onStatusChange: (status) => statuses.push(status),
    onControlFrame,
  });

  return { doc, awareness, provider, statuses };
}

describe('RelayProvider', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('mints a fresh ticket and puts it in the socket URL', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain('/documents/doc-1/ws');
    expect(FakeWebSocket.instances[0].url).toContain('ticket=ticket-xyz');

    provider.destroy();
  });

  test('sends raw binary frames', async () => {
    // The relay forwards binary byte-exact now, so no base64 round trip.
    const { doc, provider } = setup();
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();

    doc.getText('monaco').insert(0, 'héllo 👋');
    await flush();

    expect(socket.sent.length).toBeGreaterThan(0);
    socket.sent.forEach((frame) => {
      expect(frame).toBeInstanceOf(ArrayBuffer);
    });

    provider.destroy();
  });

  test('requests arraybuffer frames so they can be read synchronously', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    expect(FakeWebSocket.instances[0].binaryType).toBe('arraybuffer');

    provider.destroy();
  });

  test('opens with a sync step and an awareness announcement', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();

    // message type is the first varint: 0 = sync, 1 = awareness. Only the
    // binary plane carries these; text frames are control messages.
    const messageTypes = socket.sent
      .filter((frame): frame is ArrayBuffer => frame instanceof ArrayBuffer)
      .map((frame) => new Uint8Array(frame)[0]);
    expect(messageTypes).toContain(0);
    expect(messageTypes).toContain(1);

    provider.destroy();
  });

  test('a text frame is a control message, never a document edit', async () => {
    // Text used to carry base64 Yjs updates. The server now owns that plane
    // for its own JSON, so a string must never reach the sync reader — a
    // base64-looking payload decodes to bytes that would corrupt the doc.
    const frames: ControlFrame[] = [];
    const { doc, provider } = setup({ onControlFrame: (frame) => frames.push(frame) });
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();

    const legacy = bytesToBase64(new Uint8Array([0, 0, 1, 0]));
    expect(() => socket.onmessage?.({ data: legacy })).not.toThrow();

    expect(doc.getText('monaco').toString()).toBe('');
    expect(frames).toHaveLength(0);

    provider.destroy();
  });

  test('hands run lifecycle frames to the caller', async () => {
    const frames: ControlFrame[] = [];
    const { provider } = setup({ onControlFrame: (frame) => frames.push(frame) });
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();

    socket.onmessage?.({
      data: JSON.stringify({ type: 'run:started', requested_by: 'u1', language_id: 71 }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'run:result',
        requested_by: 'u1',
        result: { stdout: 'hi\n', stderr: '', compile_output: '', message: '', status_id: 3, status: 'Accepted', time: '0.01', memory: 1 },
      }),
    });

    expect(frames.map((frame) => frame.type)).toEqual(['run:started', 'run:result']);

    provider.destroy();
  });

  test('drops a control frame of an unknown type rather than guessing', async () => {
    const frames: ControlFrame[] = [];
    const { provider } = setup({ onControlFrame: (frame) => frames.push(frame) });
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();

    // A message type from a newer server this build predates.
    expect(() => socket.onmessage?.({ data: '{"type":"run:progress","pct":40}' })).not.toThrow();
    expect(frames).toHaveLength(0);

    provider.destroy();
  });

  test('sends a run request as JSON text, not as bytes', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.sent.length = 0;

    const sent = provider.sendRun({ language_id: 71, source_code: "print('hi')" });

    expect(sent).toBe(true);
    // A string, so the browser frames it as text and the server routes it to
    // the control plane instead of relaying it to peers.
    const [frame] = socket.sent;
    expect(typeof frame).toBe('string');
    expect(JSON.parse(frame as string)).toEqual({
      type: 'run',
      language_id: 71,
      source_code: "print('hi')",
    });

    provider.destroy();
  });

  test('reports a run it could not send because the socket is not open', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    // Never opened.
    expect(provider.sendRun({ language_id: 71, source_code: 'x' })).toBe(false);

    provider.destroy();
  });

  test('reports connected once the socket opens', async () => {
    const { provider, statuses } = setup();
    provider.connect();
    await flush();

    expect(statuses).toContain('connecting');

    FakeWebSocket.instances[0].open();
    expect(provider.getStatus()).toBe('connected');

    provider.destroy();
  });

  test('ignores a frame that is not decodable instead of throwing', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();

    expect(() => socket.onmessage?.({ data: '!!!not base64!!!' })).not.toThrow();
    expect(() => socket.onmessage?.({ data: '' })).not.toThrow();
    // a truncated/garbage binary frame must not take the connection down
    expect(() => socket.onmessage?.({ data: new ArrayBuffer(4) })).not.toThrow();

    provider.destroy();
  });

  test('a viewer transmits nothing, since the relay drops it anyway', async () => {
    const { doc, provider } = setup({ canEdit: false });
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();

    doc.getText('monaco').insert(0, 'a viewer typing locally');
    await flush();

    expect(socket.sent).toHaveLength(0);

    provider.destroy();
  });

  test('an editor still transmits normally', async () => {
    const { doc, provider } = setup({ canEdit: true });
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();

    doc.getText('monaco').insert(0, 'an editor typing');
    await flush();

    expect(socket.sent.length).toBeGreaterThan(0);

    provider.destroy();
  });

  test('stops retrying once destroyed', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    provider.destroy();

    const countAfterDestroy = FakeWebSocket.instances.length;
    socket.onclose?.();
    await flush();

    expect(FakeWebSocket.instances).toHaveLength(countAfterDestroy);
  });
});
