import { describe, expect, test } from 'vitest';
import { presenceColorFor, readPeers } from './presence';

describe('presenceColorFor', () => {
  test('gives the same person the same colour every time', () => {
    expect(presenceColorFor('user-1')).toBe(presenceColorFor('user-1'));
  });

  test('always resolves to one of the app presence variables', () => {
    ['a', 'b', 'user-42', ''].forEach((id) => {
      expect(presenceColorFor(id)).toMatch(/^var\(--presence-\d\)$/);
    });
  });
});

describe('readPeers', () => {
  test('marks the local client as self', () => {
    const states = new Map<number, unknown>([
      [1, { user: { id: 'u1', name: 'Ada', color: 'red' } }],
      [2, { user: { id: 'u2', name: 'Mira', color: 'blue' } }],
    ]);

    const peers = readPeers(states, 1);

    expect(peers).toHaveLength(2);
    expect(peers.find((p) => p.clientId === 1)?.isSelf).toBe(true);
    expect(peers.find((p) => p.clientId === 2)?.isSelf).toBe(false);
  });

  test('skips clients that have not published a user yet', () => {
    const states = new Map<number, unknown>([
      [1, { user: { id: 'u1', name: 'Ada' } }],
      [2, {}],
      [3, undefined],
    ]);

    expect(readPeers(states, 1)).toHaveLength(1);
  });

  test('fills in a name and colour when the peer omitted them', () => {
    const states = new Map<number, unknown>([[7, { user: { id: 'u7' } }]]);
    const [peer] = readPeers(states, 1);

    expect(peer.name).toBe('Someone');
    expect(peer.color).toMatch(/^var\(--presence-\d\)$/);
  });
});
