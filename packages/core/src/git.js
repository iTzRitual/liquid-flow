// Git integration: versioning and backups of the template folder,
// with optional pushing to a remote repository (e.g. GitHub).
// Wraps the `git` commands (no external dependencies).

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// GIT_TERMINAL_PROMPT=0 + empty ASKPASS prevent hanging on an interactive
// login/password prompt (a push without configured SSH or a credential helper).
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' };
const GIT_TIMEOUT_MS = 30_000; // 30 s for typical operations
const GIT_PUSH_TIMEOUT_MS = 60_000; // 60 s for push (longer transfer)

function run(cwd, args, { allowFail = false, timeout = GIT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024, timeout, env: GIT_ENV }, (err, stdout, stderr) => {
      if (err && !allowFail) {
        const msg = err.killed
          ? `git ${args[0]}: timed out after ${timeout / 1000}s`
          : (stderr || stdout || err.message).trim();
        const e = new Error(msg);
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

// Initialize the repository (if it does not exist) and make the first commit.
export async function init(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!isRepo(dir)) {
    await run(dir, ['init']);
    await run(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main'], { allowFail: true });
  }
  // local identity (when the global one is unset) — so the commit succeeds
  const name = await run(dir, ['config', 'user.name'], { allowFail: true });
  if (!name.stdout) await run(dir, ['config', 'user.name', 'Liquid Flow']);
  const email = await run(dir, ['config', 'user.email'], { allowFail: true });
  if (!email.stdout) await run(dir, ['config', 'user.email', 'liquid-flow@local']);
  await commitAll(dir, 'Initial snapshot');
  return status(dir);
}

// Commit all changes. Returns { committed, hash }.
export async function commitAll(dir, message) {
  if (!isRepo(dir)) return { committed: false };
  await run(dir, ['add', '-A']);
  // --no-optional-locks (global git flag): do not create index.lock when reading
  // state after add — prevents a race with emitGit() calling status in the background
  const st = await run(dir, ['--no-optional-locks', 'status', '--porcelain']);
  if (!st.stdout) return { committed: false };
  await run(dir, ['commit', '-m', message || 'Update']);
  const hash = await run(dir, ['rev-parse', '--short', 'HEAD']);
  return { committed: true, hash: hash.stdout };
}

// Commit history: [{ hash, iso, relative, message }].
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

// Restore the file state from a given commit (working tree), then commit.
// Files revert to the commit's version; the hot-reload uploads them to the shop.
// The commit message (visible in history) is passed by the caller — already translated.
export async function restore(dir, hash, message) {
  if (!isRepo(dir)) throw new Error('No git repository');
  await run(dir, ['checkout', hash, '--', '.']);
  return commitAll(dir, message || `Restore ${hash}`);
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

// Push the current branch to origin (assumes authentication is configured:
// an SSH key or a credential helper / token in the https URL).
export async function push(dir, branch) {
  if (!isRepo(dir)) throw new Error('No git repository');
  const b = branch || (await run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout || 'main';
  const r = await run(dir, ['push', '-u', 'origin', b], { allowFail: true, timeout: GIT_PUSH_TIMEOUT_MS });
  if (r.failed) throw new Error(r.stderr || 'git push failed');
  return { branch: b, output: r.stdout || r.stderr };
}

export async function currentBranch(dir) {
  const r = await run(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFail: true });
  return r.stdout || null;
}

export async function listBranches(dir) {
  const r = await run(dir, ['branch', '--format=%(refname:short)'], { allowFail: true });
  return r.stdout ? r.stdout.split('\n').filter(Boolean) : [];
}

export async function createBranch(dir, name, startPoint) {
  await run(dir, startPoint ? ['branch', name, startPoint] : ['branch', name]);
}

export async function switchBranch(dir, name) {
  await run(dir, ['checkout', name]);
}

export async function forceBranch(dir, branch, target) {
  await run(dir, ['branch', '-f', branch, target]);
}

export async function countCommits(dir, range) {
  const r = await run(dir, ['rev-list', '--count', range], { allowFail: true });
  return Number(r.stdout) || 0;
}

export async function pull(dir) {
  const branch = (await currentBranch(dir)) || 'main';
  const r = await run(dir, ['pull', '--ff-only', 'origin', branch],
    { allowFail: true, timeout: GIT_PUSH_TIMEOUT_MS });
  if (r.failed) throw new Error(r.stderr || 'git pull failed');
  return { branch, output: r.stdout || r.stderr };
}

export async function squashMergeInto(dir, fromBranch, intoBranch, message) {
  await run(dir, ['checkout', intoBranch]);
  await run(dir, ['merge', '--squash', fromBranch], { allowFail: true });
  // --no-optional-locks (global git flag): do not create index.lock when reading state
  const st = await run(dir, ['--no-optional-locks', 'status', '--porcelain']);
  const committed = !!st.stdout;
  if (committed) await run(dir, ['commit', '-m', message]);
  return { committed };
}

export async function cloneInto(dir, url) {
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir);
    if (entries.length) throw new Error('Target directory is not empty');
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
  const parent = path.dirname(dir);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  const r = await run(parent, ['clone', url, path.basename(dir)],
    { allowFail: true, timeout: GIT_PUSH_TIMEOUT_MS });
  if (r.failed) throw new Error(r.stderr || 'git clone failed');
  return status(dir);
}

export async function status(dir) {
  const repo = isRepo(dir);
  if (!repo) return { isRepo: false, remote: null, branch: null, lastCommit: null, dirty: false, commitCount: 0 };
  const remote = await getRemote(dir);
  // --no-optional-locks (global git flag): git status is a read operation —
  // do not create index.lock, to avoid racing with concurrent write operations
  // (auto-commit, checkout, etc.) triggered by fire-and-forget emitGit()
  const st = await run(dir, ['--no-optional-locks', 'status', '--porcelain'], { allowFail: true });
  const hist = await history(dir, 1);
  const count = await run(dir, ['rev-list', '--count', 'HEAD'], { allowFail: true });
  const branch = await currentBranch(dir);
  return {
    isRepo: true,
    remote,
    branch: branch || null,
    dirty: !!st.stdout,
    lastCommit: hist[0] || null,
    commitCount: Number(count.stdout) || 0,
  };
}
