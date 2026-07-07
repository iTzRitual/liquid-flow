// jest-dom matchers (toBeInTheDocument, toHaveClass, …) for the renderer project.
import '@testing-library/jest-dom/vitest';

// jsdom does not implement these; Base UI (and most UI primitives) reference
// them during render/positioning. Minimal stubs keep component tests stable.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
}
