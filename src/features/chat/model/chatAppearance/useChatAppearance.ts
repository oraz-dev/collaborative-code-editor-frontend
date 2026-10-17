import { useSyncExternalStore } from 'react';
import { chatAppearanceStore, type ChatAppearance } from './chatAppearanceStore';

export function useChatAppearance(): ChatAppearance {
  return useSyncExternalStore(chatAppearanceStore.subscribe, chatAppearanceStore.get, chatAppearanceStore.get);
}
