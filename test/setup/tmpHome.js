// A Vitest setupFile — runs BEFORE the test file's imports. Creates a fresh,
// unique data directory and sets `LIQUID_FLOW_HOME` before `store.js` computes
// `APP_DIR` (it does so at import time, as a `const`). This way every test file
// gets isolated on-disk state, and we clean up the directory afterward.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liquidflow-test-'));
process.env.LIQUID_FLOW_HOME = dir;

afterAll(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});
