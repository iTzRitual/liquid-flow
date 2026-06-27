# Plan 004: Regression tests for the two fixed P1 bugs (git-push failure, interrupted download)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> this plan's status row in `plans/README.md` unless a reviewer told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1599ef..HEAD -- packages/core/src/git.js packages/core/src/syncEngine.js packages/core/src/git.test.js packages/core/src/syncEngine.watcher.test.js`
> If `git.js` or `syncEngine.js` behavior changed since this plan was written,
> re-read those files before writing tests; on a mismatch with the "Current
> state" excerpts, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (if running plan 001 too, see Maintenance notes — both
  add tests to `syncEngine.watcher.test.js`; the additions don't overlap)
- **Category**: tests
- **Planned at**: commit `e1599ef`, 2026-06-27

## Why this matters

Two P1 bugs were fixed earlier (see `CODE_REVIEW.md`) but shipped **without
regression tests**, so they can silently come back:

1. **`git push` could hang forever** on an interactive credential prompt. The
   fix added `GIT_TERMINAL_PROMPT=0` + empty `GIT_ASKPASS`/`SSH_ASKPASS` and a
   60s timeout, and makes `push()` **reject** on failure instead of hanging.
   Today only the happy path (push to a local bare repo) and the no-repo case
   are tested — the **failure-propagation** path (`r.failed` → throw) is not.
2. **`_initialDownload` wrote sync metadata only at the very end**, so an
   interrupted download left files on disk with no meta — which then showed up
   as spurious conflicts. The fix writes meta **per file**. There is no test
   asserting that a mid-download failure still leaves meta for the
   already-written files.

These tests lock in both fixes cheaply and deterministically.

## Current state

**`git.js` — push failure path** (`git.js:111-117`):

```js
export async function push(dir) {
  if (!isRepo(dir)) throw new Error('No git repository');
  const branch = (await run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout || 'main';
  const r = await run(dir, ['push', '-u', 'origin', branch], { allowFail: true, timeout: GIT_PUSH_TIMEOUT_MS });
  if (r.failed) throw new Error(r.stderr || 'git push failed');
  return { branch, output: r.stdout || r.stderr };
}
```

`GIT_ENV` (`git.js:11`) sets `GIT_TERMINAL_PROMPT: '0'` so a remote that would
normally prompt for credentials fails fast instead of hanging. Pushing to a
local filesystem path that is **not** a git repository fails immediately and
deterministically (no network) — that is the lever for the failure test.

The existing git tests (`packages/core/src/git.test.js`) run **real git** in
tmp dirs, skip cleanly if git is missing (`hasGit`), and already include a
happy-path push to a bare repo (lines 80-93) and a no-repo push rejection
(lines 105-109). Model the new test on those.

**`syncEngine.js` — per-file meta during download** (`syncEngine.js:142-154`,
inside `_initialDownload`):

```js
    for (const f of files) {
      const localts = store.writeLocalFile(this.shopName, this.templateId, f.Mode, f.Name, f.Template || Buffer.alloc(0));
      // Zapisuj meta po każdym pliku (przyrostowo), żeby przerwanie/awaria nie
      // zostawiła katalogu z plikami ale bez metadanych …
      store.setMetaEntry(this.shopName, this.templateId, f.Mode, f.Name, localts, f.Date);
      done++;
      …
    }
```

> ⚠️ If plan 001 (path-traversal guard) has already landed, this loop body will
> look slightly different (a `done++` and an `if (!store.isSafeRelName(...))`
> branch wrap the write). That is fine — the per-file `setMetaEntry` is still
> there, and the test below still works because it forces a **write** failure on
> the second file, not a name-safety failure.

The existing download tests live in `packages/core/src/syncEngine.watcher.test.js`
under `describe('_initialDownload — pierwsze pobranie', …)` (lines 110-126).
The `fakeClient` there exposes a settable `files` array consumed by
`liquidFilesGet` (lines 7-25). `fs` is imported at the top; `path` is **not**
(add it).

**Conventions:** ESM, Polish comments/test descriptions. Real-git tests guard on
`hasGit`. Tests are deterministic and offline — do not add tests that hit the
network.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused | `npx vitest run packages/core/src/git.test.js packages/core/src/syncEngine.watcher.test.js` | all pass |
| Full suite | `npm test` | exit 0, all pass |

(No typecheck/lint script; `npm test` is the gate.)

## Scope

**In scope** (the only files you should modify):

- `packages/core/src/git.test.js` (add one test)
- `packages/core/src/syncEngine.watcher.test.js` (add one test + a `path` import)

**Out of scope** (do NOT touch):

- `packages/core/src/git.js`, `packages/core/src/syncEngine.js` — this plan adds
  tests only; the production fixes already exist. If a test fails, the bug
  regressed — report it; do not "fix" it by weakening the test.
- Any attempt to test the **timeout** by making git actually hang. A true
  hang-then-timeout test needs a fake slow-git harness and is flaky; it is
  intentionally **not** in scope. The failure-propagation test below is the
  practical regression guard for the no-hang behavior.

## Git workflow

- Branch: `advisor/004-regression-tests`
- Conventional Commits in English, e.g.
  `test(core): cover git-push failure and interrupted initial download`.
- **No `Co-Authored-By` footer** (repo convention in `CLAUDE.md`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a git-push failure-propagation test

In `packages/core/src/git.test.js`, add this test inside the
`describe('git.js', …)` block (e.g. right after the happy-path push test at
line 93). It points origin at an **empty, non-repo** directory so push fails
immediately and `push()` rejects:

```js
  it('push: niedostępny/nieprawidłowy remote → odrzuca (nie wisi)', async () => {
    write('a.liquid', 'x'); await git.init(dir);
    // remote wskazuje na pusty katalog, który NIE jest repozytorium gita →
    // push pada natychmiast (bez sieci, bez interaktywnego pytania o hasło,
    // dzięki GIT_TERMINAL_PROMPT=0), więc push() musi się odrzucić, nie zawisnąć.
    const badRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-noremote-'));
    await git.setRemote(dir, badRemote);
    await expect(git.push(dir)).rejects.toThrow();
    fs.rmSync(badRemote, { recursive: true, force: true });
  });
```

(`fs`, `os`, `path` are already imported at the top of `git.test.js`.)

**Verify**: `npx vitest run packages/core/src/git.test.js` → all pass, including
the new test. (If git is unavailable on the machine the whole file's body still
runs — `hasGit` only gates the `isAvailable` assertion; the push test needs git.
If git is genuinely absent, the test will error — that matches the existing
suite's assumption that dev machines have git. Report if git is missing.)

### Step 2: Add a `path` import to the syncEngine watcher test

At the top of `packages/core/src/syncEngine.watcher.test.js`, add (next to the
existing `import fs from 'node:fs';` on line 2):

```js
import path from 'node:path';
import os from 'node:os';
```

(`os` is only needed if you choose the tmp variant below; the directory-collision
approach used here needs `path` only — but importing `os` is harmless. If you
prefer, import just `path`.)

### Step 3: Add the interrupted-download regression test

Inside the existing `describe('_initialDownload — pierwsze pobranie', …)` block
(after the existing `it`, around line 125), add:

```js
  it('przerwane pobieranie zostawia meta dla już zapisanych plików (przyrostowo)', async () => {
    // Plik 'b.liquid' jest niezapisywalny: w jego miejscu tworzymy KATALOG,
    // więc fs.writeFileSync rzuci EISDIR w trakcie pętli. To symuluje awarię w
    // środku pobierania. 'a.liquid' (przetworzony wcześniej) powinien mieć meta.
    client.files = [
      { Mode: 0, Name: 'a.liquid', Template: Buffer.from('A'), Date: '2026-01-01T00:00:00' },
      { Mode: 0, Name: 'b.liquid', Template: Buffer.from('B'), Date: '2026-01-02T00:00:00' },
      { Mode: 0, Name: 'c.liquid', Template: Buffer.from('C'), Date: '2026-01-03T00:00:00' },
    ];
    // Utwórz katalog dokładnie tam, gdzie miałby powstać plik 'b.liquid'.
    const bPath = store.localFilePath(shop.Name, template.Id, 0, 'b.liquid');
    fs.mkdirSync(bPath, { recursive: true });

    await expect(session._initialDownload()).rejects.toThrow();

    const meta = store.loadMeta(shop.Name, template.Id);
    // plik 'a' przetworzony przed awarią → meta zapisane przyrostowo
    expect(store.getMetaEntry(meta, 0, 'a.liquid')).toMatchObject({ remotets: '2026-01-01T00:00:00' });
    // 'b'/'c' nie zdążyły → brak meta
    expect(store.getMetaEntry(meta, 0, 'b.liquid')).toBeNull();
    expect(store.getMetaEntry(meta, 0, 'c.liquid')).toBeNull();
  });
```

**Verify**: `npx vitest run packages/core/src/syncEngine.watcher.test.js` → all
pass, including the new test.

### Step 4: Full suite + commit

**Verify**: `npm test` → exit 0, all test files pass. Then commit per the Git
workflow section.

## Test plan

- `git.test.js`: pushing to a non-repo local path rejects (guards the
  `r.failed → throw` path and the no-hang `GIT_TERMINAL_PROMPT=0` behavior).
- `syncEngine.watcher.test.js`: a write failure on the 2nd of 3 files makes
  `_initialDownload` reject, and meta for the 1st file persists while the 2nd/3rd
  have none (guards the per-file incremental-meta fix).
- Verification: `npm test` → all pass, +2 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0; the two new tests exist and pass.
- [ ] `grep -c "niedostępny/nieprawidłowy remote" packages/core/src/git.test.js` returns 1.
- [ ] `grep -c "przerwane pobieranie" packages/core/src/syncEngine.watcher.test.js` returns 1.
- [ ] Only `git.test.js` and `syncEngine.watcher.test.js` are modified (`git status`); no production source changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The new `_initialDownload` test does **not** reject (no error thrown) — that
  means the write loop swallows the EISDIR or processes files in a different
  order than the array; re-read `_initialDownload` and report what it actually
  does rather than reshaping the test to pass.
- The git push-failure test **resolves** instead of rejecting — that means the
  `r.failed → throw` path regressed in `git.js`; report it (do not change
  `git.js`).
- `git` is not installed on the machine (the push test can't run) — report;
  don't stub git out.

## Maintenance notes

- If plan 001 (path-traversal guard) is executed in the same batch, both it and
  this plan add `it` blocks to `syncEngine.watcher.test.js`. They add **distinct**
  tests and a shared `import path from 'node:path';` line — if you run both, add
  the import once and keep both `it` blocks. No logic conflict.
- The interrupted-download test relies on `fs.writeFileSync` throwing `EISDIR`
  when the target path is a directory (POSIX + Windows). If `writeLocalFile` is
  ever changed to remove a pre-existing directory before writing, this test
  would need a different interruption lever — note that for the reviewer.
- A genuine push-timeout (hang) test is deliberately omitted; if the team later
  wants it, it needs a fake git binary on `PATH` that sleeps, which is a larger
  test-harness investment.
