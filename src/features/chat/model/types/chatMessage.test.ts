import { describe, expect, test } from 'vitest';
import { chatMessageFromFrame, mapChatMessage } from './chatMessage';

describe('mapChatMessage', () => {
  test('maps the wire shape to the domain shape', () => {
    expect(
      mapChatMessage({
        id: 'srv-1',
        document_id: 'doc-1',
        user_id: 'user-1',
        body: 'hi',
        client_msg_id: 'cmid-1',
        created_at: '2026-10-16T10:00:00Z',
      }),
    ).toEqual({
      id: 'srv-1',
      documentId: 'doc-1',
      userId: 'user-1',
      body: 'hi',
      clientMsgId: 'cmid-1',
      createdAt: '2026-10-16T10:00:00Z',
    });
  });

  test('falls back to the server id as the dedupe key when no client id is given', () => {
    expect(mapChatMessage({ id: 'srv-1', body: 'hi' }).clientMsgId).toBe('srv-1');
  });

  test('a message not yet stored has a null id and empty timestamp', () => {
    const message = mapChatMessage({ client_msg_id: 'cmid-1', body: 'hi' });
    expect(message.id).toBeNull();
    expect(message.createdAt).toBe('');
  });
});

describe('chatMessageFromFrame', () => {
  test('reads a flat frame that carries the message beside the type', () => {
    const message = chatMessageFromFrame({
      type: 'chat:message',
      id: 'srv-1',
      document_id: 'doc-1',
      user_id: 'user-1',
      body: 'hello',
      client_msg_id: 'cmid-1',
      created_at: '2026-10-16T10:00:00Z',
    });
    expect(message).toMatchObject({ id: 'srv-1', body: 'hello', clientMsgId: 'cmid-1' });
  });

  test('reads a frame that nests the message under a field', () => {
    const message = chatMessageFromFrame({
      type: 'chat:message',
      message: { id: 'srv-2', body: 'hey', client_msg_id: 'cmid-2' },
    });
    expect(message).toMatchObject({ id: 'srv-2', body: 'hey', clientMsgId: 'cmid-2' });
  });

  test('rejects a frame with no body', () => {
    expect(chatMessageFromFrame({ type: 'chat:message', client_msg_id: 'cmid-3' })).toBeNull();
  });

  test('rejects a frame with no identity to dedupe on', () => {
    expect(chatMessageFromFrame({ type: 'chat:message', body: 'orphan' })).toBeNull();
  });

  test('rejects anything that is not an object', () => {
    expect(chatMessageFromFrame(null)).toBeNull();
    expect(chatMessageFromFrame('chat:message')).toBeNull();
  });
});
