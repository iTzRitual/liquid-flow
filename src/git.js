// Integracja Git: wersjonowanie i kopie zapasowe folderu szablonu,
// z opcjonalnym wypychaniem do zdalnego repozytorium (np. GitHub).
// Opakowuje polecenia `git` (bez zewnętrznych zależności).

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(cwd, args, { allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !allowFail) {
        const e = new Error((stderr || stdout || err.message).trim());
        e.code = err.code;
        return reject(e);
      }
      resolve({ stdout: (stdout || '').trim(), stderr: (stderr || '').trim(), failed: !!err });
    });
  });
}

let _available = null;
export async function isAvailable() {
  if (_available !== null) return _available;
  try {
    await run(process.cwd(), ['--version']);
    _available = true;
  } catch {
    _available = false;
  }
  return _available;
}

export function isRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

// Zainicjuj repozytorium (jeśli nie istnieje) i wykonaj pierwszy commit.
export async function init(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!isRepo(dir)) {
    await run(dir, ['init']);
    await run(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main'], { allowFail: true });
  }
  // lokalna tożsamość (gdy globalna nieustawiona) — by commit się powiódł
  const name = await run(dir, ['config', 'user.name'], { allowFail: true });
  if (!name.stdout) await run(dir, ['config', 'user.name', 'Liquid Sync']);
  const email = await run(dir, ['config', 'user.email'], { allowFail: true });
  if (!email.stdout) await run(dir, ['config', 'user.email', 'liquid-sync@local']);
  await commitAll(dir, 'Initial snapshot');
  return status(dir);
}

// Zatwierdź wszystkie zmiany. Zwraca { committed, hash }.
export async function commitAll(dir, message) {
  if (!isRepo(dir)) return { committed: false };
  await run(dir, ['add', '-A']);
  const st = await run(dir, ['status', '--porcelain']);
  if (!st.stdout) return { committed: false };
  await run(dir, ['commit', '-m', message || 'Aktualizacja']);
  const hash = await run(dir, ['rev-parse', '--short', 'HEAD']);
  return { committed: true, hash: hash.stdout };
}

// Historia commitów: [{ hash, iso, relative, message }].
export async function history(dir, limit = 100) {
  if (!isRepo(dir)) return [];
  const fmt = '%h%x1f%cI%x1f%cr%x1f%s';
  const r = await run(dir, ['log', `--max-count=${limit}`, `--pretty=format:${fmt}`], { allowFail: true });
  if (!r.stdout) return [];
  return r.stdout.split('\n').map((line) => {
    const [hash, iso, relative, message] = line.split('\x1f');
    return { hash, iso, relative, message };
  });
}

// Przywróć stan plików z danego commita (working tree), następnie zatwierdź.
// Pliki wracają do wersji z commita; hot-reload wyśle je do sklepu.
export async function restore(dir, hash) {
  if (!isRepo(dir)) throw new Error('Brak repozytorium');
  await run(dir, ['checkout', hash, '--', '.']);
  return commitAll(dir, `Przywrócono wersję ${hash}`);
}

export async function getRemote(dir) {
  if (!isRepo(dir)) return null;
  const r = await run(dir, ['remote', 'get-url', 'origin'], { allowFail: true });
  return r.stdout || null;
}

export async function setRemote(dir, url) {
  if (!isRepo(dir)) await init(dir);
  const existing = await getRemote(dir);
  if (existing) await run(dir, ['remote', 'set-url', 'origin', url]);
  else await run(dir, ['remote', 'add', 'origin', url]);
  return getRemote(dir);
}

// Wypchnij bieżącą gałąź do origin (zakłada skonfigurowane uwierzytelnianie:
// klucz SSH lub helper poświadczeń / token w URL https).
export async function push(dir) {
  if (!isRepo(dir)) throw new Error('Brak repozytorium');
  const branch = (await run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout || 'main';
  const r = await run(dir, ['push', '-u', 'origin', branch], { allowFail: true });
  if (r.failed) throw new Error(r.stderr || 'git push nie powiódł się');
  return { branch, output: r.stdout || r.stderr };
}

export async function status(dir) {
  const repo = isRepo(dir);
  if (!repo) return { isRepo: false, remote: null, lastCommit: null, dirty: false, commitCount: 0 };
  const remote = await getRemote(dir);
  const st = await run(dir, ['status', '--porcelain'], { allowFail: true });
  const hist = await history(dir, 1);
  const count = await run(dir, ['rev-list', '--count', 'HEAD'], { allowFail: true });
  return {
    isRepo: true,
    remote,
    dirty: !!st.stdout,
    lastCommit: hist[0] || null,
    commitCount: Number(count.stdout) || 0,
  };
}
