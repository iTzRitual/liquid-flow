import { defineConfig } from 'vitest/config';

// Konfiguracja testów e2e (czarna skrzynka CLI pod pseudo‑TTY). Oddzielona od
// `vitest.config.js`, bo e2e jest wolniejsze i mniej deterministyczne — NIE
// chcemy go w domyślnym `npm test`. Uruchamiaj: `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['apps/**/e2e/**/*.e2e.js', 'packages/**/e2e/**/*.e2e.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    // Procesy pty są zasobem globalnym (TTY) — uruchamiaj pliki seryjnie, by się
    // nie przeplatały i nie biły o terminal (jeden worker, brak równoległości).
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
