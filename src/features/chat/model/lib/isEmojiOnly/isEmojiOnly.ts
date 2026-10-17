const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|⃣|[#*0-9])+$/u;
const HAS_PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Past this many emoji a message reads as text again and keeps its bubble. */
export const MAX_JUMBO_EMOJI = 5;

function graphemeCount(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter().segment(text)).length;
  }
  return Array.from(text).length;
}

/**
 * True for a short message made of emoji alone ("🔥", "👍👍", "🇹🇲"), which
 * the chat shows large and without a bubble, as messengers do.
 */
export function isEmojiOnly(body: string): boolean {
  const compact = body.replace(/\s/g, '');
  if (!compact || !EMOJI_ONLY.test(compact) || !HAS_PICTOGRAPH.test(compact)) return false;
  return graphemeCount(compact) <= MAX_JUMBO_EMOJI;
}
