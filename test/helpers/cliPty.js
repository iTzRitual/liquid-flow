// Sterownik e2e dla CLI: odpala PRAWDZIWY `bin/liquidflow.js` pod pseudo‑TTY
// (node-pty). CLI wymaga TTY (alt‑screen + raw mode), więc zwykły child_process
// nie wystarczy. Czyta strumień, pozwala wpisywać klawisze i czekać na tekst.
//
//   const cli = await startCli({ home });
//   await cli.waitFor('Połącz ze sklepem');
//   cli.write(keys.enter);
//   const code = await cli.exit();
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HELPERS_DIR, '..', '..');
const BIN = path.join(REPO_ROOT, 'apps', 'cli', 'bin', 'liquidflow.js');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][AB0]|\x1b[=>]|\x1b\][^\x07]*\x07/g;
export const strip = (s) => String(s == null ? '' : s).replace(ANSI, '');

// Sekwencje klawiszy (te same co w ink.js, ale dla pty).
export const keys = {
  up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D',
  enter: '\r', escape: '\x1b', slash: '/',
};

// node-pty rozpakowuje prebuilt `spawn-helper` BEZ bitu wykonywalności, przez co
// `posix_spawnp` pada. Naprawiamy to samoczynnie (przeżywa `npm install`, bo
// dzieje się w teście). Tylko POSIX; Windows używa conpty (bez helpera).
export function ensureSpawnHelper() {
  if (process.platform === 'win32') return;
  const base = path.join(REPO_ROOT, 'node_modules', 'node-pty', 'prebuilds');
  let dirs = [];
  try { dirs = fs.readdirSync(base); } catch { return; }
  for (const d of dirs) {
    const helper = path.join(base, d, 'spawn-helper');
    try {
      const st = fs.statSync(helper);
      if (!(st.mode & 0o111)) fs.chmodSync(helper, 0o755);
    } catch {}
  }
}

// Utwórz świeży katalog danych dla instancji CLI. `config` (opcjonalny) zapisujemy
// jako config.json — np. by zaseedować zapisany sklep wskazujący na mock SOAP.
export function makeHome(config) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'liquidflow-e2e-'));
  if (config) fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(config, null, 2));
  return home;
}

export async function startCli({ home, env = {}, cols = 100, rows = 30 } = {}) {
  ensureSpawnHelper();
  const { spawn } = await import('node-pty');
  // Czyste otoczenie dla dziecka. Vitest wstrzykuje do workerów NODE_OPTIONS
  // (loader/register) oraz zmienne VITEST_*/TINYPOOL_* — odziedziczone przez
  // spawnięty `node` rozbiłyby start CLI (pusty ekran). Usuwamy je. Nie
  // ustawiamy CI=1 — Ink wtedy nie renderuje interaktywnie.
  const childEnv = { ...process.env, ...env, LIQUID_FLOW_HOME: home, FORCE_COLOR: '3' };
  for (const k of Object.keys(childEnv)) {
    if (k === 'NODE_OPTIONS' || k === 'CI' || k.startsWith('VITEST') || k.startsWith('TINYPOOL')) delete childEnv[k];
  }
  const pty = spawn(process.execPath, [BIN], {
    name: 'xterm-256color',
    cols, rows,
    cwd: REPO_ROOT,
    env: childEnv,
  });

  let buf = '';
  let exitInfo = null;
  const exitWaiters = [];
  pty.onData((d) => { buf += d; });
  pty.onExit((e) => { exitInfo = e; for (const r of exitWaiters) r(e); });

  const api = {
    pty,
    get output() { return strip(buf); },
    raw() { return buf; },
    write(s) { pty.write(s); return api; },

    // Czekaj aż w (oczyszczonym) strumieniu pojawi się tekst/regex.
    waitFor(matcher, timeout = 8000) {
      const test = typeof matcher === 'string'
        ? (s) => s.includes(matcher)
        : (s) => matcher.test(s);
      return new Promise((resolve, reject) => {
        if (test(strip(buf))) return resolve(strip(buf));
        const iv = setInterval(() => {
          if (test(strip(buf))) { clearInterval(iv); clearTimeout(to); resolve(strip(buf)); }
          else if (exitInfo) { clearInterval(iv); clearTimeout(to); reject(new Error(`CLI zakończył się (code ${exitInfo.exitCode}) przed dopasowaniem ${matcher}\n--- output ---\n${tail(strip(buf))}`)); }
        }, 25);
        const to = setTimeout(() => {
          clearInterval(iv);
          reject(new Error(`timeout czekając na ${matcher}\n--- output (ogon) ---\n${tail(strip(buf))}`));
        }, timeout);
      });
    },

    // Wyślij /exit i poczekaj na czyste zakończenie procesu.
    async exit(timeout = 8000) {
      // upewnij się, że jesteśmy w polu input (Esc z dowolnej nakładki), potem
      // wpisz komendę i zatwierdź.
      pty.write(keys.escape);
      await delay(120);
      pty.write('/exit');
      await delay(120);
      pty.write(keys.enter);
      return api.waitExit(timeout);
    },

    waitExit(timeout = 8000) {
      if (exitInfo) return Promise.resolve(exitInfo.exitCode);
      return new Promise((resolve, reject) => {
        exitWaiters.push((e) => { clearTimeout(to); resolve(e.exitCode); });
        const to = setTimeout(() => reject(new Error(`CLI nie zakończył się w ${timeout}ms`)), timeout);
      });
    },

    kill() { try { pty.kill(); } catch {} },
  };
  return api;
}

function tail(s, n = 1200) { return s.length > n ? '…' + s.slice(-n) : s; }
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
