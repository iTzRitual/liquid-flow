import { defineConfig } from 'vitest/config';

// Test configuration (Vitest). The whole project is ESM, so no transpilation.
// Phase 1 covers the core (`packages/core`) and pure CLI logic (`window.js`).
// Ink component tests (ink-testing-library) and web renderer tests will be added
// in later phases — it is enough to add globs to `include` and, if needed, a
// project with the 'jsdom' environment.
export default defineConfig({
  test: {
    // Only our *.test.* files — we do not touch the manual render-smoke scripts
    // (apps/cli/test/*.mjs), which you still run via `node`.
    include: [
      'packages/core/**/*.test.js',
      'apps/cli/**/*.test.js',
      // Ink components (JSX) — interactions via ink-testing-library.
      'apps/cli/**/*.test.jsx',
      'apps/mcp/**/*.test.js',
    ],
    environment: 'node',
    // A fresh, isolated data directory (LIQUID_FLOW_HOME) per test file — set
    // BEFORE `store.js` computes its paths at import time.
    setupFiles: ['./test/setup/tmpHome.js'],
    // Every file gets its own module registry: the env from setupFiles takes
    // effect before the static imports of the tested module.
    isolate: true,
    clearMocks: true,
  },
});
