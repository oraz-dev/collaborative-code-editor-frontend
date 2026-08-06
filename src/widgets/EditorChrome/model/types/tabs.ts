export interface EditorTab {
  id: string;
  name: string;
}

/**
 * Opening a file the editor already has open moves focus to it rather than
 * adding a duplicate — matching how a tab strip behaves everywhere else.
 */
export function openTab(tabs: EditorTab[], tab: EditorTab): EditorTab[] {
  const existing = tabs.findIndex((entry) => entry.id === tab.id);
  if (existing === -1) return [...tabs, tab];
  // The name can change under us after a rename, so refresh it in place.
  if (tabs[existing].name === tab.name) return tabs;
  return tabs.map((entry) => (entry.id === tab.id ? tab : entry));
}

export function closeTab(tabs: EditorTab[], id: string): EditorTab[] {
  return tabs.filter((entry) => entry.id !== id);
}

/**
 * Which tab to focus after closing one: the neighbour on the right, falling
 * back to the left, and null when the strip empties.
 */
export function tabAfterClosing(tabs: EditorTab[], id: string): EditorTab | null {
  const index = tabs.findIndex((entry) => entry.id === id);
  if (index === -1) return null;

  const remaining = closeTab(tabs, id);
  if (remaining.length === 0) return null;
  return remaining[Math.min(index, remaining.length - 1)];
}
