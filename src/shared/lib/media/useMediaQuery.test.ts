import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MEDIA, useIsCompact, useIsPhone, useMediaQuery } from './useMediaQuery';

interface FakeList {
  matches: boolean;
  listeners: Set<() => void>;
}

/** Stands in for matchMedia so a query can be flipped mid-test. */
function installMatchMedia(initial: Record<string, boolean>) {
  const lists = new Map<string, FakeList>();

  vi.stubGlobal('matchMedia', (query: string) => {
    let list = lists.get(query);
    if (!list) {
      list = { matches: initial[query] ?? false, listeners: new Set() };
      lists.set(query, list);
    }
    const current = list;
    return {
      get matches() { return current.matches; },
      addEventListener: (_: string, fn: () => void) => current.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => current.listeners.delete(fn),
    };
  });

  return {
    set(query: string, matches: boolean) {
      const list = lists.get(query);
      if (!list) return;
      list.matches = matches;
      list.listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  test('reports the match on the very first render', () => {
    installMatchMedia({ '(max-width: 640px)': true });
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'));

    // Not `false` then `true` — a phone must never paint the desktop layout.
    expect(result.current).toBe(true);
  });

  test('follows the query when the viewport changes', () => {
    const media = installMatchMedia({ '(max-width: 640px)': false });
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'));
    expect(result.current).toBe(false);

    act(() => media.set('(max-width: 640px)', true));
    expect(result.current).toBe(true);
  });

  test('detaches its listener on unmount', () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener,
    }));

    renderHook(() => useMediaQuery('(max-width: 640px)')).unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });
});

describe('breakpoint hooks', () => {
  test('a phone is compact, a tablet is compact but not a phone', () => {
    installMatchMedia({ [MEDIA.phone]: false, [MEDIA.compact]: true });

    expect(renderHook(() => useIsPhone()).result.current).toBe(false);
    expect(renderHook(() => useIsCompact()).result.current).toBe(true);
  });
});
