import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { base64ToBytes } from '@/shared/lib/base64/base64';
import { RelayProvider, type ConnectionStatus } from './RelayProvider';

/** Minimal stand-in for the browser WebSocket, capturing what gets sent. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  url: string;
  readyState = 0;
  sent: string[] = [];
  binaryType = 'blob';

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
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

function setup(options: { canEdit?: boolean } = {}) {
  const { canEdit = true } = options;
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

  test('sends only base64 text, never raw binary', async () => {
    // The relay re-emits frames as text and drops peers on non-UTF-8 bytes,
    // so every outgoing protocol message has to be base64.
    const { doc, provider } = setup();
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();

    doc.getText('monaco').insert(0, 'héllo 👋');
    await flush();

    expect(socket.sent.length).toBeGreaterThan(0);
    socket.sent.forEach((frame) => {
      expect(typeof frame).toBe('string');
      expect(frame).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      // and it must decode back to bytes
      expect(() => base64ToBytes(frame)).not.toThrow();
    });

    provider.destroy();
  });

  test('opens with a sync step and an awareness announcement', async () => {
    const { provider } = setup();
    provider.connect();
    await flush();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();

    // message type is the first varint: 0 = sync, 1 = awareness
    const messageTypes = socket.sent.map((frame) => base64ToBytes(frame)[0]);
    expect(messageTypes).toContain(0);
    expect(messageTypes).toContain(1);

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
    // binary frames are not part of this protocol and must be skipped
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
