import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Desktop renderer (design-system) component tests: jsdom + Testing Library.
// Deliberately a SEPARATE config, run AFTER the node suite (see the root `test`
// script), so its jsdom workers never compete for CPU with the timing-sensitive
// Ink CLI tests — the same reason vitest.e2e.config.js is kept apart.
const rendererSrc = fileURLToPath(new URL('./apps/desktop/renderer/src', import.meta.url));

export default defineConfig({
  // Renderer components resolve the app's `@` alias and use the React automatic
  // JSX runtime (no test-only Babel/plugin needed).
  resolve: { alias: { '@': rendererSrc } },
  esbuild: { jsx: 'automatic' },
  test: {
    name: 'renderer',
    include: ['apps/desktop/renderer/src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./apps/desktop/vitest.setup.ts'],
    globals: true,
    clearMocks: true,
  },
});
