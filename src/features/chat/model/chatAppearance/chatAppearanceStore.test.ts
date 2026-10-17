import { beforeEach, describe, expect, test } from 'vitest';
import {
  CHAT_APPEARANCE_STORAGE_KEY,
  DEFAULT_CHAT_APPEARANCE,
  chatAppearanceStore,
  normaliseChatAppearance,
} from './chatAppearanceStore';

describe('chatAppearanceStore', () => {
  beforeEach(() => {
    localStorage.clear();
    chatAppearanceStore.reload();
  });

  test('starts from the defaults', () => {
    expect(chatAppearanceStore.get()).toEqual(DEFAULT_CHAT_APPEARANCE);
  });

  test('remembers the chosen skin and accent across reloads', () => {
    chatAppearanceStore.setSkin('doodle');
    chatAppearanceStore.setAccent('pink');
    chatAppearanceStore.reload();
    expect(chatAppearanceStore.get()).toMatchObject({ skin: 'doodle', accent: 'pink' });
  });

  test('moves a used emoji to the front of recents without duplicating it', () => {
    chatAppearanceStore.rememberEmoji('🦀');
    chatAppearanceStore.rememberEmoji('🔥');
    const recent = chatAppearanceStore.get().recentEmojis;
    expect(recent.slice(0, 2)).toEqual(['🔥', '🦀']);
    expect(recent.filter((e) => e === '🔥')).toHaveLength(1);
  });

  test('notifies subscribers', () => {
    let calls = 0;
    const unsubscribe = chatAppearanceStore.subscribe(() => { calls += 1; });
    chatAppearanceStore.setSkin('neon');
    unsubscribe();
    chatAppearanceStore.setSkin('snow');
    expect(calls).toBe(1);
  });

  test('falls back to defaults for unknown or corrupt values', () => {
    localStorage.setItem(CHAT_APPEARANCE_STORAGE_KEY, '{not json');
    chatAppearanceStore.reload();
    expect(chatAppearanceStore.get()).toEqual(DEFAULT_CHAT_APPEARANCE);
    expect(normaliseChatAppearance({ skin: 'nope', accent: 7, recentEmojis: 'x' })).toEqual(DEFAULT_CHAT_APPEARANCE);
  });
});
