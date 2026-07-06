import { defineConfig } from 'vitest/config';

// e2e test configuration (a black-box CLI under a pseudo-TTY). Separated from
// `vitest.config.js` because e2e is slower and less deterministic — we do NOT
// want it in the default `npm test`. Run with: `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['apps/**/e2e/**/*.e2e.js', 'packages/**/e2e/**/*.e2e.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    // pty processes are a global resource (TTY) — run files serially, so they
    // do not interleave or fight over the terminal (one worker, no parallelism).
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
