import { defineConfig } from 'vitest/config';

// Test configuration (Vitest). The whole project is ESM, so no transpilation.
// Phase 1 covers the core (`packages/core`) and pure CLI logic (`window.js`).
// Ink component tests (ink-testing-library) and web renderer tests will be added
// in later phases — it is enough to add globs to `include` and, if needed, a
// project with the 'jsdom' environment.
//
// The desktop renderer (jsdom) suite runs from a SEPARATE config
// (vitest.renderer.config.js) so it never competes for CPU with the
// timing-sensitive Ink CLI tests — see the `test` script.
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
    // Run test FILES one at a time. Several suites (Ink component tests via
    // ink-testing-library, and Controller tests that spin async work over a
    // shared tmp LIQUID_FLOW_HOME) are timing-sensitive: they pass reliably in
    // isolation but flake under cross-file CPU/IO contention. Serial files
    // recreate the isolation condition — the same reason e2e runs serially.
    // Tests within a file still run in order; module state stays isolated per
    // file (`isolate: true`).
    fileParallelism: false,
    // A fresh, isolated data directory (LIQUID_FLOW_HOME) per test file — set
    // BEFORE `store.js` computes its paths at import time.
    setupFiles: ['./test/setup/tmpHome.js'],
    // Every file gets its own module registry: the env from setupFiles takes
    // effect before the static imports of the tested module.
    isolate: true,
    clearMocks: true,
  },
});
