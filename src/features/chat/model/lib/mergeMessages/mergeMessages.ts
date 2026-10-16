import type { ChatMessageStatus, ChatMessageView } from '../../types/chatMessage';

/** Confirmed beats in-flight beats failed, so an echo can only upgrade a send. */
const STATUS_RANK: Record<ChatMessageStatus, number> = {
  failed: 0,
  sending: 1,
  sent: 2,
};

function parseTime(createdAt: string): number {
  if (!createdAt) return Number.POSITIVE_INFINITY;
  const time = Date.parse(createdAt);
  // An unparseable timestamp sorts as "just now" rather than jumping the list.
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Folds one message into another that shares its identity.
 *
 * The confirmed copy's server fields (id, timestamp) win, because an optimistic
 * send has none yet. Status only ever climbs: an echo of a message still shown
 * as sending upgrades it to sent, but a stale frame can never knock a sent
 * message back. The original local order is kept so a confirmed message does
 * not jump as its timestamp lands.
 */
function combine(a: ChatMessageView, b: ChatMessageView): ChatMessageView {
  const confirmed = STATUS_RANK[b.status] >= STATUS_RANK[a.status] ? b : a;
  const weaker = confirmed === b ? a : b;

  return {
    ...confirmed,
    id: confirmed.id ?? weaker.id,
    createdAt: confirmed.createdAt || weaker.createdAt,
    // Keep the earliest localSeq so position in the list stays put.
    localSeq: Math.min(a.localSeq, b.localSeq),
  };
}

/**
 * Merges message lists into one, deduped by `clientMsgId` and sorted oldest
 * first. Later arguments win field-wise where identities collide — so passing
 * the existing list first and incoming messages after lets a server echo
 * settle an optimistic copy in place.
 */
export function mergeMessages(...lists: ChatMessageView[][]): ChatMessageView[] {
  const byId = new Map<string, ChatMessageView>();

  for (const list of lists) {
    for (const message of list) {
      const existing = byId.get(message.clientMsgId);
      byId.set(message.clientMsgId, existing ? combine(existing, message) : message);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const byTime = parseTime(a.createdAt) - parseTime(b.createdAt);
    return byTime !== 0 ? byTime : a.localSeq - b.localSeq;
  });
}
