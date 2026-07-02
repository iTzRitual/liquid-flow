import { defineConfig } from 'vitest/config';

// Konfiguracja testów (Vitest). Cały projekt to ESM, więc bez transpilacji.
// Faza 1 obejmuje rdzeń (`packages/core`) oraz czystą logikę CLI (`window.js`).
// Testy komponentów Ink (ink-testing-library) i renderera web dojdą w kolejnych
// fazach — wystarczy dorzucić globy do `include` i ewentualnie projekt z
// environment 'jsdom'.
export default defineConfig({
  test: {
    // Tylko nasze pliki *.test.* — nie ruszamy ręcznych skryptów render-smoke
    // (apps/cli/test/*.mjs), które nadal odpalasz przez `node`.
    include: [
      'packages/core/**/*.test.js',
      'apps/cli/**/*.test.js',
      // Komponenty Ink (JSX) — interakcje przez ink-testing-library.
      'apps/cli/**/*.test.jsx',
      'apps/mcp/**/*.test.js',
    ],
    environment: 'node',
    // Świeży, izolowany katalog danych (LIQUID_FLOW_HOME) per plik testowy —
    // ustawiany ZANIM `store.js` policzy swoje ścieżki przy imporcie.
    setupFiles: ['./test/setup/tmpHome.js'],
    // Każdy plik w osobnym module registry: env z setupFiles obowiązuje przed
    // statycznymi importami testowanego modułu.
    isolate: true,
    clearMocks: true,
  },
});
