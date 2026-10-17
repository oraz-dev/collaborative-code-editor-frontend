import { logger } from '@/shared/lib/logger/logger';
import {
  DEFAULT_CHAT_ACCENT,
  DEFAULT_CHAT_SKIN,
  isChatAccentId,
  isChatSkinId,
  type ChatAccentId,
  type ChatSkinId,
} from '../consts/chatSkins';
import { DEFAULT_RECENT_EMOJIS, RECENT_EMOJI_LIMIT } from '../consts/emojiCategories';

export const CHAT_APPEARANCE_STORAGE_KEY = 'space:chat-appearance';

export interface ChatAppearance {
  skin: ChatSkinId;
  accent: ChatAccentId;
  recentEmojis: readonly string[];
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  skin: DEFAULT_CHAT_SKIN,
  accent: DEFAULT_CHAT_ACCENT,
  recentEmojis: DEFAULT_RECENT_EMOJIS,
};

type Listener = () => void;

export function normaliseChatAppearance(raw: unknown): ChatAppearance {
  const source = (raw ?? {}) as Partial<Record<keyof ChatAppearance, unknown>>;
  const recent = Array.isArray(source.recentEmojis)
    ? source.recentEmojis.filter((e): e is string => typeof e === 'string' && e.length > 0 && e.length <= 16)
    : null;
  return {
    skin: isChatSkinId(source.skin) ? source.skin : DEFAULT_CHAT_APPEARANCE.skin,
    accent: isChatAccentId(source.accent) ? source.accent : DEFAULT_CHAT_APPEARANCE.accent,
    recentEmojis: recent && recent.length > 0 ? recent.slice(0, RECENT_EMOJI_LIMIT) : DEFAULT_RECENT_EMOJIS,
  };
}

function read(): ChatAppearance {
  try {
    const raw = localStorage.getItem(CHAT_APPEARANCE_STORAGE_KEY);
    return raw ? normaliseChatAppearance(JSON.parse(raw)) : DEFAULT_CHAT_APPEARANCE;
  } catch {
    // Private mode or corrupt JSON — the defaults are fine.
    return DEFAULT_CHAT_APPEARANCE;
  }
}

let current: ChatAppearance = read();
const listeners = new Set<Listener>();

function persist(next: ChatAppearance): void {
  current = next;
  try {
    localStorage.setItem(CHAT_APPEARANCE_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    logger.warn('Could not save chat appearance', error);
  }
  listeners.forEach((listener) => listener());
}

/**
 * How the chat looks to this viewer. Personal and local, like the editor
 * preferences: a theme changes nothing for anyone else in the room.
 */
export const chatAppearanceStore = {
  get(): ChatAppearance {
    return current;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setSkin(skin: ChatSkinId): void {
    persist({ ...current, skin });
  },

  setAccent(accent: ChatAccentId): void {
    persist({ ...current, accent });
  },

  /** Moves an emoji to the front of "Recently used". */
  rememberEmoji(emoji: string): void {
    const recentEmojis = [emoji, ...current.recentEmojis.filter((e) => e !== emoji)].slice(0, RECENT_EMOJI_LIMIT);
    persist({ ...current, recentEmojis });
  },

  /** Test seam — re-reads localStorage so specs start from a known state. */
  reload(): void {
    current = read();
    listeners.forEach((listener) => listener());
  },
};
