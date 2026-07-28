export interface PresencePeer {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  isSelf: boolean;
}

export interface AwarenessUser {
  id: string;
  name: string;
  color: string;
}

/**
 * Matches the `--presence-N` custom properties the UI already ships, so remote
 * cursors pick up the app's palette instead of arbitrary colours.
 */
const PRESENCE_COLORS = [
  'var(--presence-1)',
  'var(--presence-2)',
  'var(--presence-3)',
  'var(--presence-4)',
  'var(--presence-5)',
];

/** Stable per-user colour: the same person keeps their colour across sessions. */
export function presenceColorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

interface AwarenessState {
  user?: Partial<AwarenessUser>;
}

export function readPeers(
  states: Map<number, unknown>,
  localClientId: number,
): PresencePeer[] {
  const peers: PresencePeer[] = [];

  states.forEach((rawState, clientId) => {
    const user = (rawState as AwarenessState | undefined)?.user;
    if (!user?.id) return;

    peers.push({
      clientId,
      userId: user.id,
      name: user.name ?? 'Someone',
      color: user.color ?? presenceColorFor(user.id),
      isSelf: clientId === localClientId,
    });
  });

  return peers;
}
