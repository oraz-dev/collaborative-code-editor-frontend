import { useSyncExternalStore } from 'react';
import { preferencesStore } from './preferencesStore';
import { DEFAULT_PREFERENCES, type Preferences } from './types/preferences';

function getServerSnapshot(): Preferences {
  return DEFAULT_PREFERENCES;
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.get,
    getServerSnapshot,
  );
}

export function useAppearancePreferences() {
  return usePreferences().appearance;
}

export function useEditorPreferences() {
  return usePreferences().editor;
}

export function useCollaborationPreferences() {
  return usePreferences().collaboration;
}
