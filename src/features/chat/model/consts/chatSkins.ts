/**
 * Chat themes ("skins"). Each one restyles the bubbles and the wallpaper
 * behind them; the styles live in ChatMessageGroup's stylesheet, keyed by the
 * `data-skin` attribute on whatever element wraps the conversation.
 */
export type ChatSkinTag = 'Clean' | 'Fun' | 'Retro' | 'Vibes' | 'Seasonal';

export type ChatSkinId =
  | 'classic' | 'daylight' | 'glass'
  | 'doodle' | 'pets' | 'comic' | 'candy' | 'sticky' | 'hearts'
  | 'terminal' | 'pixel' | 'win95' | 'gameboy' | 'typewriter'
  | 'neon' | 'space' | 'ocean' | 'forest'
  | 'spooky' | 'snow';

export interface ChatSkin {
  id: ChatSkinId;
  label: string;
  tag: ChatSkinTag;
}

export const CHAT_SKINS: readonly ChatSkin[] = [
  { id: 'classic', label: 'Classic', tag: 'Clean' },
  { id: 'daylight', label: 'Daylight', tag: 'Clean' },
  { id: 'glass', label: 'Glass', tag: 'Clean' },
  { id: 'doodle', label: 'Doodle', tag: 'Fun' },
  { id: 'pets', label: 'Pets', tag: 'Fun' },
  { id: 'comic', label: 'Comic', tag: 'Fun' },
  { id: 'candy', label: 'Candy', tag: 'Fun' },
  { id: 'sticky', label: 'Sticky notes', tag: 'Fun' },
  { id: 'hearts', label: 'Hearts', tag: 'Fun' },
  { id: 'terminal', label: 'Terminal', tag: 'Retro' },
  { id: 'pixel', label: 'Pixel', tag: 'Retro' },
  { id: 'win95', label: 'Windows 95', tag: 'Retro' },
  { id: 'gameboy', label: 'Game Boy', tag: 'Retro' },
  { id: 'typewriter', label: 'Typewriter', tag: 'Retro' },
  { id: 'neon', label: 'Neon', tag: 'Vibes' },
  { id: 'space', label: 'Space', tag: 'Vibes' },
  { id: 'ocean', label: 'Ocean', tag: 'Vibes' },
  { id: 'forest', label: 'Forest', tag: 'Vibes' },
  { id: 'spooky', label: 'Spooky', tag: 'Seasonal' },
  { id: 'snow', label: 'Snow', tag: 'Seasonal' },
];

export const CHAT_SKIN_TAGS: readonly ChatSkinTag[] = ['Clean', 'Fun', 'Retro', 'Vibes', 'Seasonal'];

export const DEFAULT_CHAT_SKIN: ChatSkinId = 'classic';

export type ChatAccentId = 'mint' | 'azure' | 'violet' | 'coral' | 'amber' | 'pink';

export interface ChatAccent {
  id: ChatAccentId;
  label: string;
  /** Bubble fill. */
  color: string;
  /** Text on that fill. */
  onColor: string;
}

/** Bubble colours for the Classic skin — the only one that lets you pick. */
export const CHAT_ACCENTS: readonly ChatAccent[] = [
  { id: 'mint', label: 'Mint', color: '#2fc88e', onColor: '#04170f' },
  { id: 'azure', label: 'Azure', color: '#4d9eff', onColor: '#061325' },
  { id: 'violet', label: 'Violet', color: '#9d7cff', onColor: '#140a33' },
  { id: 'coral', label: 'Coral', color: '#ef6c5a', onColor: '#2a0b06' },
  { id: 'amber', label: 'Amber', color: '#e7ab43', onColor: '#2a1c03' },
  { id: 'pink', label: 'Pink', color: '#ff6fb5', onColor: '#2e0619' },
];

export const DEFAULT_CHAT_ACCENT: ChatAccentId = 'mint';

export function isChatSkinId(value: unknown): value is ChatSkinId {
  return CHAT_SKINS.some((skin) => skin.id === value);
}

export function isChatAccentId(value: unknown): value is ChatAccentId {
  return CHAT_ACCENTS.some((accent) => accent.id === value);
}

export function accentById(id: ChatAccentId): ChatAccent {
  return CHAT_ACCENTS.find((accent) => accent.id === id) ?? CHAT_ACCENTS[0];
}
