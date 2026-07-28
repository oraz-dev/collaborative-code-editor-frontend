import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

/**
 * Every test starts with a network that answers "unauthenticated". Tests that
 * care about data override `global.fetch` themselves, and nothing ever reaches
 * the real backend by accident.
 */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ error: 'unauthorized' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )))
})

// jsdom ships neither of these, and several UI components probe them.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
