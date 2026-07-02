# Plan 008: Fix the git-serialization race (red test suite) + clone reachability & branch-base bug

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in "STOP
> conditions" occurs, stop and report — do not improvise. **Do not weaken or
> delete an existing test to make the suite green** — the suite is red because of
> a real bug; fix the bug. When done, update the status rows for plans 006, 007,
> and 008 in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat bfa02e7..HEAD -- packages/core/src/git.js packages/core/src/controller.js packages/core/src/syncEngine.js`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code first; on a mismatch, STOP.

## Status

- **Priority**: P0 (the test gate is red; CLAUDE.md forbids committing with a red
  suite, and the underlying race is a production hazard)
- **Effort**: M
- **Risk**: MED (touches the auto-commit path and the session serialization seam
  used by every git operation)
- **Depends on**: plans 006 + 007 (this fixes regressions introduced by their
  implementation in commit `bfa02e7`).
- **Category**: bug
- **Planned at**: commit `bfa02e7`, 2026-06-29

## Why this matters

Plans 006/007 landed in `bfa02e7` and were marked DONE, but **`npm test` is red**
(1 failed / 266 passed). The failing test is
`packages/core/src/controller.session.test.js > "autoCommit commituje na
liquidflow/wip i nie wypycha"`, dying with:

```
fatal: Unable to create '.../files/5/0/.git/index.lock': File exists.
Another git process seems to be running in this repository
```

**Root cause (a real bug, not just a flaky test):** the debounced auto-commit
(`Controller._doAutoCommit`) runs git index mutations (`git add -A`, `git commit`,
branch checkout) on a free-running `setTimeout` — **outside** the session's
serialization queue. Plans 006/007 made *new* git operations
(`gitCheckpoint`/`gitPull`/`gitCreateBranch`/`gitSwitchBranch`/`gitClone`)
serialize through `SyncSession.withWatcherPaused` (which uses the session's
`_enqueue` queue), but auto-commit and `gitRestore` were left outside it. So a
debounced auto-commit can run **concurrently** with another git operation (or with
itself) on the same repo → two `git` processes contend for `.git/index.lock` →
crash. In real use this surfaces as a failed auto-commit, checkpoint, pull, or
restore whenever one overlaps the 3-second auto-commit debounce.

The fix is to serialize **all** git index access for a template repo on the
session's single queue. Two smaller correctness issues found in the same review
are fixed here too (branch-base bug; a network-dependent test), and the
clone-reachability gap is addressed or explicitly deferred (Step 5).

## Current state

- **`packages/core/src/syncEngine.js`** — `withWatcherPaused(fn)` is the only
  serialization seam (syncEngine.js:341-355). It both serializes (via
  `_enqueue`) **and** pauses the watcher + runs `refreshMismatches`:
  ```js
  async withWatcherPaused(fn) {
    return this._enqueue(async () => {
      this._stopWatcher();
      try { const r = await fn(); await this.refreshMismatches(); return r; }
      catch (e) { logErr(e.message); throw e; }
      finally { this._startWatcher(); }
    });
  }
  ```
  `_enqueue(fn)` (syncEngine.js:204) is the private promise-chain queue that also
  serializes `_processChange` (hot-reload) and `command()`. There is **no**
  public "serialize on the queue *without* touching the watcher" method — git-only
  ops (auto-commit, restore) need exactly that (they must NOT pause the watcher;
  restore deliberately relies on the watcher to push restored files to the shop).

- **`packages/core/src/controller.js`**:
  - `_onSynced` schedules the debounced auto-commit (controller.js:363-368):
    ```js
    this._commitTimer = setTimeout(() => this._doAutoCommit().catch(() => {}), COMMIT_DEBOUNCE_MS);
    ```
  - `_doAutoCommit` runs git **directly**, not through any queue
    (controller.js:384-403):
    ```js
    async _doAutoCommit() {
      if (!this.activeGit) return;
      const files = [...this._pendingCommitFiles]; this._pendingCommitFiles.clear();
      const t = this.t; const msg = /* … */;
      try {
        if (!git.isRepo(this.activeGit.dir)) await git.init(this.activeGit.dir);
        await this._ensureWipBranch();
        const r = await git.commitAll(this.activeGit.dir, msg);   // ← git add -A / commit, UNQUEUED
        if (r.committed) { logbuf.logInfo(logbuf.tmsg('GitVersionSaved', { hash: r.hash })); this.emitGit(); }
      } catch (e) { logbuf.logErr(logbuf.tmsg('GitCommitError', { msg: e.message })); }
    }
    ```
  - `_ensureWipBranch` has a **dead `base` variable / wrong-base bug**
    (controller.js:370-382): `base` is computed but never passed to
    `createBranch`, so `wip` is created from the current HEAD, not from `main`:
    ```js
    const base = branches.includes('main') ? 'main' : (cur || 'main');
    await git.createBranch(dir, 'liquidflow/wip');   // ← `base` ignored
    ```
  - `gitRestore` runs `git.restore` **directly**, unqueued (controller.js:462-470).
    Restore mutates the index (checkout + commit) and so can collide with
    auto-commit. It must serialize, but must **not** pause the watcher.
  - `gitCheckpoint` (controller.js:489-539) does `git.status(dir)` (line 501) and a
    conditional `git.commitAll` (lines 507-512) **outside** its `withWatcherPaused`
    call (line 531). `git status` can refresh and lock the index, and `commitAll`
    writes it — both must run inside the queued body.
  - `gitPull` (controller.js:541-570) does `git.countCommits` outside the queue
    (line 546). `countCommits` is `git rev-list` — read-only, does **not** lock the
    index — so it is safe to leave outside; do not move it.
  - `gitCreateBranch`/`gitSwitchBranch` (controller.js:572-594) already wrap their
    git op in `withWatcherPaused` — leave them.
  - `dispose()` clears `_commitTimer` (controller.js:663). `this._commitTimer` /
    `this._pendingCommitFiles` init at controller.js:35-36; `COMMIT_DEBOUNCE_MS =
    3000` (controller.js:15).

- **`packages/core/src/git.js`** — `createBranch(dir, name)` has no start-point:
  ```js
  export async function createBranch(dir, name) { await run(dir, ['branch', name]); }
  ```
  (located just after `listBranches`, ~git.js:124). `run(cwd, args, opts)`
  (git.js:15) is the execFile wrapper.

- **`packages/core/src/git.test.js`** — the `cloneInto` bad-remote case
  (git.test.js:248-250) uses a **real network domain**:
  ```js
  await expect(git.cloneInto(badMode0Dir, 'https://invalid-domain-nonexistent-12345.com/repo.git')).rejects.toThrow();
  ```
  The established network-free pattern (used by the `push` bad-remote test,
  git.test.js:95-104, and `pull` bad-remote, git.test.js:213-216) points the remote
  at a **local empty directory that is not a git repo** — git fails instantly with
  no DNS/network. Use that pattern.

- **`packages/core/src/controller.session.test.js`** — the failing test is at
  lines 113-137. Setup: `beforeEach` gives each test a unique shop
  (`SessShop${n++}`, line 16); `afterEach` calls `ctrl.dispose()` (line 19);
  `connectAndSelect()` (line 27) seeds a shop whose `Url` points at the mock SOAP
  server and runs `selectTemplate(5)`. Tests that drive git stop the watcher with
  `ctrl.state.session._stopWatcher()` and call `await ctrl._doAutoCommit()`
  directly. **This test's assertions are correct — do not change them; they must
  pass once the bug is fixed.**

### Conventions

- **ESM**, Node 18+. No new dependencies — git via `execFile` through the existing
  `run`. Comments in Polish; any user-visible string in both `pl` and `en` tables
  of `translations.js` (this plan likely needs **no** new strings).
- **Versioning/changelog** (CLAUDE.md): bump the patch version in **all three**
  `package.json` (root, `apps/cli`, `packages/core`) and add a `CHANGELOG.md`
  section. Read the current version from any of the three (they are synced;
  currently `0.9.113`).
- **Test gate**: `npm test` must be 100% green (Vitest). New logic gets a test in
  the same change.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Full gate | `npm test` | exit 0, **all** green (267+ tests) |
| Session suite (the failing one) | `npx vitest run packages/core/src/controller.session.test.js` | all pass |
| Git suite | `npx vitest run packages/core/src/git.js` (or `-- git`) | pass (or skip if no git) |
| syncEngine suite | `npx vitest run packages/core/src/syncEngine.watcher.test.js` | pass |
| Determinism (race) | run the session suite 5× in a loop (see Step 2) | pass every time |
| i18n parity | `node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;console.log('missing-en:',Object.keys(pl).filter(k=>en[k]===undefined));console.log('untranslated:',Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k])))})"` | `missing-en: []` and `untranslated: []` |

No typecheck/lint script — `npm test` is the gate.

## Scope

**In scope:**
- `packages/core/src/syncEngine.js` — add public `runExclusive(fn)`; refactor
  `withWatcherPaused` to build on it. No other watcher/queue changes.
- `packages/core/src/controller.js` — route `_doAutoCommit` and `gitRestore`
  through `session.runExclusive`; move `gitCheckpoint`'s `git.status` +
  conditional `commitAll` inside its queued body; fix the `_ensureWipBranch`
  base bug; route the `git.init` paths in `gitEnable`/`gitSetSettings` through
  `runExclusive` when a session exists (lower-priority hardening — see Step 3).
- `packages/core/src/git.js` — `createBranch(dir, name, startPoint)` (optional
  3rd arg).
- `packages/core/src/git.test.js` — make the `cloneInto` bad-remote case
  network-free; add a `createBranch` start-point assertion.
- `packages/core/src/controller.session.test.js` — add a **deterministic**
  concurrency regression test (Step 2). Keep all existing tests passing unchanged.
- `packages/core/src/syncEngine.watcher.test.js` — add a `runExclusive`
  serialization unit test.
- `README.md` — refresh the `/git` section (wip → checkpoint → push, pull,
  branches, clone) — the executor of 006/007 skipped this.
- `CHANGELOG.md`, the three `package.json` versions.
- `plans/README.md` — set 006/007 status correctly (see Step 6).

**Out of scope (do NOT touch):**
- `apps/desktop/**`, `soap.js`, the diff/conflict logic.
- The watcher internals beyond adding `runExclusive` and refactoring
  `withWatcherPaused`. Do **not** change `_stopWatcher`/`_startWatcher`/`_enqueue`
  semantics or clear `_debounce` on stop (that would drop unprocessed edits).
- **Do not make `restore` pause the watcher** — it must keep propagating restored
  files to the shop (it is the deliberate exception). `runExclusive` does NOT pause
  the watcher; that is exactly why restore uses it.
- Do not weaken existing assertions to go green.

## Steps

### Step 1: Add `runExclusive(fn)` to `SyncSession`; refactor `withWatcherPaused`

In `packages/core/src/syncEngine.js`, add a public queue-only method and rebuild
`withWatcherPaused` on top of it:

```js
// Serializuj `fn` na tej samej kolejce co command()/_processChange — BEZ
// zatrzymywania watchera i BEZ refreshMismatches. Dla operacji gita, które mutują
// indeks repo (.git/index) ale NIE zapisują working tree (auto-commit, restore):
// muszą być wzajemnie wykluczone z innymi operacjami gita, a watcher ma działać
// dalej (restore liczy na hot-reload przywróconych plików do sklepu).
async runExclusive(fn) {
  return this._enqueue(fn);
}

async withWatcherPaused(fn) {
  return this.runExclusive(async () => {
    this._stopWatcher();
    try {
      const r = await fn();
      await this.refreshMismatches();
      return r;
    } catch (e) {
      logErr(e.message);
      throw e;
    } finally {
      this._startWatcher();
    }
  });
}
```

**Verify**: `npx vitest run packages/core/src/syncEngine.watcher.test.js` →
existing tests still pass.

Add a unit test (in `syncEngine.watcher.test.js`, copy the existing setup that
constructs a `SyncSession` with an injected mock client): enqueue two overlapping
`runExclusive` calls and assert they execute **serially**, not interleaved — e.g.
each `fn` pushes `start`/`end` markers around an `await new Promise(r =>
setImmediate(r))`, and assert the marker order is `['s1','e1','s2','e2']` (never
`['s1','s2',...]`). Also assert the watcher is **not** stopped by `runExclusive`
(`watcherActive` stays `true` across the call when it was true before).

### Step 2: Serialize `_doAutoCommit` and `gitRestore`; deterministic regression test

In `packages/core/src/controller.js`:

- **`_doAutoCommit`** — wrap the git work in `session.runExclusive` (fallback to
  direct when there is no session):
  ```js
  async _doAutoCommit() {
    if (!this.activeGit) return;
    const files = [...this._pendingCommitFiles];
    this._pendingCommitFiles.clear();
    const t = this.t;
    const msg = files.length === 1
      ? tfmt(t.GitCommitSyncOne, { file: files[0] })
      : tfmt(t.GitCommitSyncMany, { count: files.length, files: files.slice(0, 3).join(', ') + (files.length > 3 ? '…' : '') });
    const commitFn = async () => {
      if (!git.isRepo(this.activeGit.dir)) await git.init(this.activeGit.dir);
      await this._ensureWipBranch();
      const r = await git.commitAll(this.activeGit.dir, msg);
      if (r.committed) {
        logbuf.logInfo(logbuf.tmsg('GitVersionSaved', { hash: r.hash }));
        this.emitGit();
      }
    };
    try {
      if (this.state.session) await this.state.session.runExclusive(commitFn);
      else await commitFn();
    } catch (e) {
      logbuf.logErr(logbuf.tmsg('GitCommitError', { msg: e.message }));
    }
  }
  ```

- **`gitRestore`** — serialize the `git.restore` call via `runExclusive` (NOT
  `withWatcherPaused` — the watcher must stay live):
  ```js
  async gitRestore(hash) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const dir = this.activeGit.dir;
    const restoreFn = () => git.restore(dir, hash, tfmt(this.t.GitRestoreCommit, { hash }));
    const r = this.state.session ? await this.state.session.runExclusive(restoreFn) : await restoreFn();
    logbuf.logOk(logbuf.tmsg('GitVersionRestored', { hash }));
    if (this.state.session) await this.state.session.refreshMismatches();
    this.emitGit();
    return r;
  }
  ```

- **`gitCheckpoint`** — move `git.status(dir)` and the conditional `git.commitAll`
  (currently controller.js:501, 507-512) **inside** the `withWatcherPaused`
  body so no git command runs unqueued. Keep the `_commitTimer` clear + `await
  this._doAutoCommit()` flush before it (the flush self-queues via `runExclusive`).
  `git.countCommits` may stay where it is (read-only `rev-list`, no lock). The
  "nothing to checkpoint" early-return can move inside the queued body (return a
  sentinel like `{ nothing: true }` and log after), or stay before the
  `withWatcherPaused` call using only `countCommits` — **do not** call `git.status`
  outside the queue. If unsure, put the whole check+merge sequence inside one
  `withWatcherPaused` and branch on the result.

**Verify**:
1. The previously failing test passes:
   `npx vitest run packages/core/src/controller.session.test.js` → all pass.
2. **Determinism** — run it repeatedly; it must pass every time:
   ```
   for i in 1 2 3 4 5; do npx vitest run packages/core/src/controller.session.test.js || break; done
   ```
   Expect 5 clean runs.

Add a **deterministic regression test** in `controller.session.test.js` (model on
the existing git tests there): after `connectAndSelect()` + `gitEnable()`, fire two
auto-commits concurrently on the same repo and assert neither throws and the
commit lands on `liquidflow/wip`:
```js
it('równoległe auto-commity nie kolidują na .git/index.lock', async () => {
  await connectAndSelect();
  await ctrl.gitEnable();
  const dir = ctrl.activeGit.dir;
  fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'A');
  ctrl._pendingCommitFiles.add('index.liquid');
  // two overlapping commits must serialize, not race the index lock
  await Promise.all([ctrl._doAutoCommit(), ctrl._doAutoCommit()]);
  expect(await git.currentBranch(dir)).toBe('liquidflow/wip');
});
```
(With the old code this intermittently throws `index.lock`; with the fix it always
passes because both runs serialize on the session queue.)

### Step 3: Fix the `_ensureWipBranch` branch-base bug

In `packages/core/src/git.js`, give `createBranch` an optional start-point:
```js
export async function createBranch(dir, name, startPoint) {
  await run(dir, startPoint ? ['branch', name, startPoint] : ['branch', name]);
}
```

In `packages/core/src/controller.js` `_ensureWipBranch`, pass the computed base:
```js
if (!branches.includes('liquidflow/wip')) {
  const base = branches.includes('main') ? 'main' : (cur || 'main');
  await git.createBranch(dir, 'liquidflow/wip', base);   // create FROM main, not current HEAD
}
```

(Lower-priority hardening, same step: in `gitEnable` and `gitSetSettings`, when
`this.state.session` exists, run the `git.init` + `_ensureWipBranch` pair through
`session.runExclusive` so first-time init can't race an in-flight auto-commit. If
this complicates the flow, it is acceptable to skip — note it in the PR.)

**Verify**: add to the existing git.test.js branch test (git.test.js:122-137) an
assertion that a branch created with a start-point points there:
```js
await git.switchBranch(dir, 'main');
await git.createBranch(dir, 'feature/x', 'main');
// feature/x is created from main even though HEAD may be elsewhere
```
`npx vitest run packages/core/src/git.js` → pass.

### Step 4: Make the `cloneInto` bad-remote test network-free

In `packages/core/src/git.test.js`, replace the real-domain URL
(git.test.js:248-250) with the local-non-repo-dir pattern used by the `push`/`pull`
bad-remote tests:
```js
const badRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-noremote-'));
const badTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-clone-bad-'));
const badMode0Dir = path.join(badTargetDir, '0');
await expect(git.cloneInto(badMode0Dir, badRemote)).rejects.toThrow();
fs.rmSync(badRemote, { recursive: true, force: true });
fs.rmSync(badTargetDir, { recursive: true, force: true });
```

**Verify**: `npx vitest run packages/core/src/git.js` → pass, and it must pass with
networking disabled (the test no longer resolves DNS).

### Step 5 (GATED — confirm before implementing, else defer): clone reachability

The review found `Controller.gitClone` is effectively unreachable for its stated
purpose: it requires `this.state.session` **and** an empty mode-`0` dir, but
obtaining a session goes through `selectTemplate → _startSession → session.start()
→ _initialDownload`, which populates mode-`0`. So "clone instead of the initial
SOAP download" can't happen via the normal connect→select flow; the CLI even
offers Clone in the no-repo menu, where it typically fails with
`GitCloneDirNotEmpty`. This is a **product/flow decision**, not a mechanical fix.

**Do not guess.** Either:
- **(a) Defer** — leave `gitClone` as-is, and record clone-reachability as a new
  `plans/009-git-clone-bootstrap-flow.md` (a connect-time "bootstrap from remote"
  option that runs *before* `_initialDownload`). This is the recommended default;
  it keeps 008 focused on the regression.
- **(b) Implement now only if the maintainer confirms the flow**: add a
  connect/select-time branch — when a template's mode-`0` dir is empty and the user
  supplies a remote URL, clone (mode-`0`) + SOAP-download other modes + seed meta
  **instead of** `_initialDownload`, then start the watcher. This touches the
  connect flow and needs the URL-source + overwrite semantics decided first.

**STOP and ask** which path before writing any code for this step. If no answer is
available, take (a): write the 009 stub and move on.

### Step 6: README, changelog, version, plans index

- Update the `/git` section of `README.md` to describe the wip → checkpoint →
  push flow, pull, branch create/switch, and clone (executor of 006/007 skipped
  this).
- Bump the patch version in all three `package.json`; add a `CHANGELOG.md` section.
- In `plans/README.md`: set **008 → DONE** only after `npm test` is green; set
  **006/007 → DONE** (their code is correct once this plan lands) — or, if Step 5
  was deferred, leave a one-line note on the 007 row that clone-bootstrap wiring is
  tracked in 009.

**Verify**: i18n parity one-liner → `missing-en: []` / `untranslated: []`.
`npm test` fully green.

## Test plan

- **`syncEngine.watcher.test.js`**: `runExclusive` serializes overlapping calls and
  does not stop the watcher.
- **`controller.session.test.js`**: the previously failing auto-commit test passes
  unchanged; the new "równoległe auto-commity nie kolidują" test passes
  deterministically; existing checkpoint/pull/clone tests stay green.
- **`git.test.js`**: `createBranch` with a start-point; `cloneInto` bad-remote is
  network-free.
- Verification: `npm test` → all pass; the session suite passes 5× in a row.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0, **all** green; the session suite passes 5 consecutive runs.
- [ ] No git command in `_doAutoCommit`, `gitRestore`, or `gitCheckpoint` runs
      outside the session queue (`runExclusive`/`withWatcherPaused`).
- [ ] `restore` still does **not** pause the watcher (it uses `runExclusive`, not
      `withWatcherPaused`).
- [ ] A new deterministic test proves two concurrent auto-commits do not hit
      `index.lock`.
- [ ] `_ensureWipBranch` creates `liquidflow/wip` from `main` (start-point passed);
      `git.createBranch` accepts a start-point and is covered by a test.
- [ ] The `cloneInto` bad-remote test is network-free.
- [ ] i18n parity one-liner prints `missing-en: []` and `untranslated: []`.
- [ ] `README.md` `/git` section updated; versions bumped (3×); `CHANGELOG.md`
      entry added.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] `plans/README.md` rows for 006/007/008 reflect reality; Step 5 decision
      recorded.

## STOP conditions

Stop and report (do not improvise) if:

- "Current state" excerpts don't match live code (drift).
- After routing `_doAutoCommit`/`gitRestore`/`gitCheckpoint` through the queue, the
  session suite still fails or is non-deterministic (means the race has another
  source — capture the failing interleaving and report).
- Serializing auto-commit appears to deadlock (e.g. a queued op awaits another
  queued op on the same session) — report the call chain instead of forcing it.
- Step 5 needs a flow decision and no maintainer answer is available — take the
  defer path (a) and note it.
- Any test would need its assertions weakened to pass.

## Maintenance notes

- **Single rule going forward:** every git operation on a template repo
  (read-that-locks-the-index or write) must run on the session queue —
  `runExclusive(fn)` for git-only ops that must keep the watcher live (auto-commit,
  restore), `withWatcherPaused(fn)` for tree-mutating ops (checkpoint, pull,
  branch switch, clone). `git rev-list`/`countCommits` are read-only and exempt.
- A reviewer should check that no new controller git path calls `git.*` directly
  outside one of those two wrappers.
- Deferred: clone-bootstrap reachability (Step 5 → possibly plan 009);
  per-branch remote tracking; desktop parity.
