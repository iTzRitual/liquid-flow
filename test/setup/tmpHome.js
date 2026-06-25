// setupFile Vitest — uruchamiany PRZED importami pliku testowego. Tworzy świeży,
// unikalny katalog danych i ustawia `LIQUID_FLOW_HOME`, zanim `store.js` policzy
// `APP_DIR` (robi to przy imporcie, jako `const`). Dzięki temu każdy plik testowy
// dostaje izolowany stan na dysku, a po zakończeniu sprzątamy katalog.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liquidflow-test-'));
process.env.LIQUID_FLOW_HOME = dir;

afterAll(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});
