# Plan 006: Git workflow redesign — WIP branch for hot-reload, checkpoint-merge, pull

> **Executor instructions**: This is a **design/spike plan**. Its primary
> deliverable is a ratified branch model plus the **core git primitives** (built &
> tested against a local bare repo) and the controller wiring. The CLI `/git`
> menu wiring is specified but **gated** behind the Step 0 design decisions — do
> **not** ship the UI changes until the branch model is confirmed. Run every
> verification command. If anything in "STOP conditions" occurs, stop and report
> — do not improvise. When done, update this plan's status row in
> `plans/README.md` and fill "## Spike outcome".
>
> **`clone` was moved out of this plan** into `plans/007-git-clone-bootstrap.md`
> (it collides with the two-mode + external-meta layout and needs its own work).
> Do **not** implement clone here.
>
> **Drift check (run first)**:
> `git diff --stat e2e008a..HEAD -- packages/core/src/git.js packages/core/src/controller.js packages/core/src/syncEngine.js apps/cli/src/commands.js`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code first; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L (spike + core primitives + controller wiring is M; UI wiring + the
  watcher-pause seam push it to L)
- **Risk**: MED (changes how/where auto-commits land; interacts with the live
  file watcher and the e-Sklep sync state)
- **Depends on**: plan 005 (DONE — `previewConflict`/diff view already merged;
  pulled changes surface as `Timestamp` conflicts that 005's diff helps resolve).
  Hard dependency: **none**.
- **Category**: direction
- **Planned at**: commit `e2e008a`, 2026-06-29

## Why this matters

Liquid Flow's Git integration is **write-only and noisy**. Two problems, one
redesign:

1. **Hot-reload floods history.** Every saved file triggers a debounced
   auto-commit on the working branch (`main`), and with auto-push on, every few
   seconds of editing pushes a `Sync: foo.liquid` commit to `origin/main`. The
   "backup history" becomes unusable as a *shared* history — a collaborator sees
   hundreds of granular sync commits, not meaningful checkpoints.
2. **The loop is open.** `git.js` exposes `push`/`setRemote`/`getRemote` but
   **no `pull`, `fetch`, or branch operations**, and the controller has `gitPush`
   but no `gitPull`. A teammate (or the same dev on a new machine) cannot pull
   shared history through the app — they drop to a terminal.

The fix is a deliberate **two-tier branch workflow** (below) plus the missing
`pull`/branch primitives. Cloning a fresh template from a remote is a separate,
larger concern handled by plan 007.

## Proposed design (the recommendation to validate in Step 0)

**Two branches per template repo (which lives in the mode-`0` working dir,
`store.templateModeDir(shop.Name, template.Id, 0)`):**

- **`main`** — the clean, shareable branch. Meaningful checkpoints only. This is
  what `push`/`pull` operate on; what collaborators see.
- **`liquidflow/wip`** — the live working branch. **All hot-reload auto-commits
  land here** (the granular every-save safety net). Created from `main` when the
  repo is first used in a session (checked out if it exists). **Never pushed**
  (auto or manual).

**Actions:**

- **Auto-commit (changed):** commits go to `liquidflow/wip`, not `main`. Same 3s
  debounce, same per-file messages. **`_doAutoCommit` no longer pushes at all** —
  see the `autoPush` redefinition below. `main` stays pristine.
- **Checkpoint / Publish (new):** squash-merge `liquidflow/wip` → `main` with a
  user-supplied message (e.g. "Checkpoint: header redesign"); **force `wip` back
  to `main`** (`git branch -f wip main`, *not* a fast-forward — see Step 1); then
  push `main` if `autoPush` is on or on explicit request. Net result: one
  meaningful commit on `main`/`origin`; granular history stays recoverable
  locally on `wip`'s reflog until the next checkpoint overwrites the ref.
- **Pull (new):** fast-forward `main` from `origin/main` with the watcher paused.
  Requires no unpublished `wip` commits → natural order is *checkpoint, then
  pull*; if `wip` is ahead of `main`, **block and tell the user** rather than
  guessing a merge. After pull, re-run `refreshMismatches` so the new files
  reconcile against the shop (surfacing as conflicts — plan 005's diff resolves
  them).
- **Branch management (new):** create / switch branches for feature or experiment
  work. Switching with a live watcher = pause watcher, `git checkout`, re-baseline
  via `refreshMismatches`.

**`autoPush` is redefined.** Today `autoPush` makes `_doAutoCommit` push the
current branch after every commit (controller.js:379-382). Under the wip model
that would auto-push `wip` every few seconds — the exact noise we are killing,
just on another branch. New meaning: **`autoPush` = "push `main` automatically
after a Checkpoint."** `_doAutoCommit` never pushes. The standalone `/git → Push`
item pushes **`main`**, never `wip`.

**The crux to get right:** the watcher writes files, and pull/checkout/merge
*also* write files — so **every tree-mutating git op (except restore, see below)
must pause the watcher**, exactly as `SyncSession.command()` already does
(`_stopWatcher()` … `finally { _startWatcher() }`, syncEngine.js:338-377). There
is **no existing public hook** for this, so Step 1 adds one
(`SyncSession.withWatcherPaused(fn)`); route all new git operations through it and
follow each with `refreshMismatches`.

**`restore` is the deliberate exception.** `git.restore` does `checkout hash -- .`
*without* pausing the watcher, on purpose: hot-reload then propagates the restored
files back to the shop (git.js:86-93 comment, controller.js:443-451). Do **not**
"fix" restore to pause the watcher — that would break restore-to-shop. The
"pause the watcher" rule applies to **re-baselining** ops (pull, checkout, merge),
not to restore.

## Current state

- **`packages/core/src/git.js`** — the entire git wrapper. Has `isAvailable`,
  `isRepo`, `init` (sets branch `main` via `symbolic-ref HEAD refs/heads/main`,
  git.js:52), `commitAll`, `history`, `restore`, `getRemote`, `setRemote`,
  `push`, `status`. **No `pull`, branch create/switch/list, merge, or
  branch-force.** `run(cwd, args, opts)` (git.js:15) is the execFile wrapper with
  `GIT_TERMINAL_PROMPT=0`/empty `GIT_ASKPASS` and timeouts (30s default, 60s
  push) — reuse it for new commands; give network ops (`pull`) the longer
  timeout. `push` (git.js:111-117) currently pushes `rev-parse --abbrev-ref HEAD`
  (the current branch).

- **`packages/core/src/syncEngine.js`** — the watcher + command queue. Relevant:
  - `_startWatcher()` (syncEngine.js:165) watches `store.templateDir(...)` =
    `files/<id>/` **recursively** — i.e. **both** mode `0` and mode `2`. Dotfiles
    (`.git`, `.DS_Store`) are skipped by `store.parseLocalPath`, so the repo's
    `.git` is never synced.
  - `_stopWatcher()` (syncEngine.js:184) and `_enqueue(fn)` (syncEngine.js:204).
  - `command(comm, fileArg, typeArg)` (syncEngine.js:338-377) is the **only**
    public path that pauses the watcher; it runs a fixed `switch`, not an
    arbitrary callback:
    ```js
    async command(comm, fileArg, typeArg) {
      return this._enqueue(async () => {
        this._stopWatcher();
        try { /* fixed switch: download/upload/removeLocal/... */
          await this.refreshMismatches();
        } catch (e) { logErr(e.message); throw e; }
        finally { this._startWatcher(); }
        return this.mismatches;
      });
    }
    ```
    → There is **no** public "run this fn with the watcher paused" method. Step 1
    adds `withWatcherPaused(fn)` modeled exactly on this shape.
  - `refreshMismatches(opts)` (syncEngine.js:276) keys conflicts off
    `store.loadMeta` — **no meta entry ⇒ the file shows as a conflict** (relevant
    to plan 007, not here).

- **`packages/core/src/controller.js`** — auto-commit currently targets the
  active branch directly and pushes it:
  ```js
  // controller.js:359-388 (_onSynced → _doAutoCommit)
  async _onSynced(info) {
    if (info && info.label) this._pendingCommitFiles.add(info.label);
    if (!this.activeGit || !this.activeGit.autoCommit) return;
    if (this._commitTimer) clearTimeout(this._commitTimer);
    this._commitTimer = setTimeout(() => this._doAutoCommit().catch(() => {}), COMMIT_DEBOUNCE_MS);
  }
  async _doAutoCommit() {
    if (!this.activeGit) return;
    const files = [...this._pendingCommitFiles]; this._pendingCommitFiles.clear();
    // ... builds msg ...
    if (!git.isRepo(this.activeGit.dir)) await git.init(this.activeGit.dir);
    const r = await git.commitAll(this.activeGit.dir, msg);   // ← commits on current branch (main)
    if (r.committed) {
      logbuf.logInfo(logbuf.tmsg('GitVersionSaved', { hash: r.hash }));
      if (this.activeGit.autoPush) { try { await git.push(this.activeGit.dir); ... } ... }  // ← pushes current branch
      this.emitGit();
    }
  }
  ```
  - `COMMIT_DEBOUNCE_MS = 3000` (controller.js:15). `this._commitTimer` /
    `this._pendingCommitFiles` init at controller.js:35-36.
  - `this.activeGit = { dir, autoCommit, autoPush }` is set in `_startSession`
    (controller.js:312-316), `dir = store.templateModeDir(shop.Name, template.Id, 0)`.
  - Git settings persist per-template under `tCfg.git` (controller.js:431).
  - The `/git` UI methods: `gitStatus` (390), `gitEnable` (413), `gitSetSettings`
    (426), `gitHistory` (438), `gitRestore` (443), `gitSetRemote` (453),
    `gitPush` (462). `gitRestore` calls `state.session.refreshMismatches()` after
    restoring (controller.js:448) — note it does **not** pause the watcher.
  - The session is reachable as `this.state.session` (a `SyncSession`).

- **`apps/cli/src/commands.js`** — the `/git` menu (`gitMenu`, commands.js:255-302):
  toggles for `AutoCommit`/`AutoPush`, plus items `history`, `remote`, `push`.
  New actions (Checkpoint, Pull, Branch) slot in here as additional items,
  following the exact `openPicker(title, items, onSelect)` / `openForm(...)` shape
  already used (e.g. the remote-URL form at commands.js:287-288).

- **Test exemplars:**
  - `packages/core/src/git.test.js`: integration tests run **real `git`** in
    `fs.mkdtempSync` dirs and push to a **local bare repo**
    (`git init --bare -b main`), skipping the suite if git is unavailable. The
    `push` test (git.test.js:80-93) and the "bad remote rejects, doesn't hang"
    test (git.test.js:95-104) are the patterns to copy for `pull` and the new
    primitives.
  - `packages/core/src/syncEngine.watcher.test.js`: drives a `SyncSession` with an
    **injected mock client** (`new SyncSession(shop, tpl, { client })`) on the
    real `store`. Copy its setup for the `withWatcherPaused` test.
  - `packages/core/src/controller.session.test.js` /
    `packages/core/src/controller.test.js`: seed a shop whose `Url` points at the
    **mock SOAP server** (`test/helpers/mockSoapServer.js`), connect →
    `selectTemplate` → session start → drive git. Copy for the checkpoint / pull
    tests.

### Conventions

- **i18n**: every new user-visible string → keys in **both** `pl` and `en` tables
  of `translations.js`. Model on the existing `Git*` block (pl at
  translations.js:116-131 and 226-236; `en` is `{ ...pl, …overrides }` lower in
  the file — add the English override next to the other `Git*` overrides).
  Git's *technical* English strings (commit messages, plumbing errors) stay in
  `git.js` by design — only UI-facing text the controller emits is translated.
- **No new deps.** Everything is `execFile('git', …)` through the existing `run`.
- **Logs** go through `logbuf.tmsg('Key', params)` descriptors (i18n-aware), like
  the existing `GitVersionSaved`/`GitPushError` calls — not pre-rendered strings.
- **Versioning/changelog** (CLAUDE.md): bump the patch version in **all three**
  `package.json` (root, `apps/cli`, `packages/core`) and add a `CHANGELOG.md`
  section per commit.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests (gate) | `npm test` | exit 0, all green |
| Git suite | `npm test -- git` | git.js tests pass (or skip if no git) |
| Controller suite | `npm test -- controller` | pass |
| syncEngine suite | `npm test -- syncEngine` | pass |
| Flows suite | `npm test -- commands.flows` | pass |
| i18n parity | `node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;console.log('untranslated:',Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k])))})"` | `untranslated: []` |

No typecheck/lint script — `npm test` is the gate.

## Scope

**In scope:**
- `packages/core/src/git.js` — add thin `run(...)` wrappers:
  `pull(dir)`, `currentBranch(dir)`, `createBranch(dir, name)`,
  `switchBranch(dir, name)`, `listBranches(dir)`,
  `squashMergeInto(dir, fromBranch, intoBranch, message)`,
  `forceBranch(dir, branch, target)` (the `git branch -f` primitive),
  `countCommits(dir, range)` (e.g. `'main..liquidflow/wip'`). Extend `push` with
  an **optional** `branch` arg (backward compatible: defaults to current branch).
- `packages/core/src/git.test.js` — tests for every new primitive (bare-repo
  round-trips), **including two consecutive checkpoints** (see Step 1).
- `packages/core/src/syncEngine.js` — add **one** additive public method
  `withWatcherPaused(fn)` (modeled on `command()`). Do **not** change any existing
  watcher/command internals.
- `packages/core/src/syncEngine.watcher.test.js` — test that `withWatcherPaused`
  stops the watcher around `fn`, runs `refreshMismatches`, and restarts it.
- `packages/core/src/controller.js` — route auto-commit onto `liquidflow/wip`
  (drop the push from `_doAutoCommit`); add `gitCheckpoint(message)`, `gitPull()`,
  `gitCreateBranch(name)`, `gitSwitchBranch(name)`, `gitListBranches()`; redefine
  `autoPush`; make `gitPush()` push `main`. Persist nothing new beyond existing
  `tCfg.git`.
- `packages/core/src/controller.test.js` / `controller.session.test.js` — cover
  the new controller methods via the mock-SOAP seam.
- `packages/core/src/translations.js` — new keys (pl + en).
- `apps/cli/src/commands.js` — `/git` menu: Checkpoint, Pull, Branch
  (create/switch). **Gated — see Step 0.**
- `apps/cli/src/commands.flows.test.js` — cover new menu routing + the
  destructive/history-affecting confirmation.
- `CHANGELOG.md`, the three `package.json` versions, `README.md` git section.

**Out of scope (do NOT touch):**
- **`clone` / fetching a fresh template from a remote** — that is plan 007. This
  plan assumes the mode-`0` repo already exists (created by `git.init` on first
  use, as today).
- `apps/desktop/**`.
- The SOAP layer (`soap.js`) and the file-sync logic in `syncEngine.js` **beyond
  the single additive `withWatcherPaused` method** — do not touch the watcher,
  `command`, `refreshMismatches`, `_processChange`, or poll internals.
- Rewriting `restore`/`history` semantics — additive only. **Do not make
  `restore` pause the watcher** (it is the intentional exception).
- Any auto-merge/rebase strategy for divergent `wip` — pull blocks on
  unpublished work instead (an intentional simplification; revisit later).

## Step 0: Confirm the branch model before wiring UI (DESIGN GATE)

Before writing the CLI changes (Step 4), validate these open questions by
prototyping the primitives (Steps 1-3) and **report back / confirm** if any answer
must differ from the proposed design:

1. **Squash + branch-force for Checkpoint.** Default: **squash-merge** `wip`→`main`
   then **`git branch -f wip main`** (overwrite the `wip` ref). The granular `wip`
   history becomes unreachable from any branch (recoverable via reflog until the
   next checkpoint). Confirm that's acceptable; if durable granular history is
   required, use a real merge commit instead — that changes `squashMergeInto` and
   removes the `forceBranch` step.
2. **`wip` branch name & lifecycle.** Default `liquidflow/wip`, created from `main`
   on first git use in a session, forced back to `main` after each checkpoint.
   Confirm no collision with user branches.
3. **Pull when `wip` is ahead of `main`.** Default: **block** with a clear message
   ("checkpoint your changes before pulling"). Confirm — do not silently
   merge/rebase.
4. **`autoPush` redefinition.** Default: `autoPush` = "push `main` after a
   Checkpoint"; `_doAutoCommit` never pushes; manual `/git → Push` pushes `main`.
   Confirm (this is a behavior change visible to users who had auto-push on).
5. **Migration of existing repos** (created before this plan, all commits on
   `main`, possibly noisy). Default: on first session after upgrade, create
   `liquidflow/wip` from current `main`; existing `main` history is left as-is.
   Confirm acceptable.

**STOP and report** if any of these can't be answered as proposed — the UI wiring
(Step 4) depends on them. Record the resolved answers in "## Spike outcome".

## Steps

### Step 1: Core git primitives (`git.js`) + tests

Add the wrappers (all via the existing `run`). Sketches:

```js
export async function currentBranch(dir) {
  const r = await run(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFail: true });
  return r.stdout || null; // null on a fresh repo with no commits / detached HEAD
}
export async function listBranches(dir) {
  const r = await run(dir, ['branch', '--format=%(refname:short)'], { allowFail: true });
  return r.stdout ? r.stdout.split('\n').filter(Boolean) : [];
}
export async function createBranch(dir, name) { await run(dir, ['branch', name], { allowFail: true }); }
export async function switchBranch(dir, name) { await run(dir, ['checkout', name]); }
export async function forceBranch(dir, branch, target) { await run(dir, ['branch', '-f', branch, target]); }
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
// Checkpoint: squash-merge fromBranch into intoBranch with a message. Leaves the
// repo checked out on intoBranch. The CALLER then forceBranch(dir, fromBranch,
// intoBranch) and switches back to fromBranch (see controller, Step 3).
export async function squashMergeInto(dir, fromBranch, intoBranch, message) {
  await run(dir, ['checkout', intoBranch]);
  await run(dir, ['merge', '--squash', fromBranch], { allowFail: true });
  const st = await run(dir, ['status', '--porcelain']);
  const committed = !!st.stdout;
  if (committed) await run(dir, ['commit', '-m', message]);
  return { committed };
}
```

Extend `push` to accept an optional branch (backward compatible):

```js
export async function push(dir, branch) {
  if (!isRepo(dir)) throw new Error('No git repository');
  const b = branch || (await run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout || 'main';
  const r = await run(dir, ['push', '-u', 'origin', b], { allowFail: true, timeout: GIT_PUSH_TIMEOUT_MS });
  if (r.failed) throw new Error(r.stderr || 'git push failed');
  return { branch: b, output: r.stdout || r.stderr };
}
```

> **Why `forceBranch`, not "fast-forward".** After `merge --squash wip` into
> `main`, `main` has a new commit that is **not** reachable from `wip`; the
> branches have diverged, so `merge --ff-only wip→main` is impossible. You must
> overwrite the ref: `git branch -f wip main`. And it is **not optional**: if
> `wip` is not reset to `main`, the *next* checkpoint's `merge --squash` re-diffs
> from the old merge-base and **re-applies the already-published commits**
> (duplicate/conflict). The test below proves this.

Network op (`pull`) uses `timeout: GIT_PUSH_TIMEOUT_MS` and must **reject, not
hang**, on a bad/unreachable remote (guaranteed by `GIT_TERMINAL_PROMPT=0` +
empty `GIT_ASKPASS`).

**Verify**: `npm test -- git` → new tests pass. Add, mirroring git.test.js:
- `pull --ff-only` picks up a commit pushed to the bare repo by a second clone;
- bad remote → `pull` rejects (copy the push bad-remote test);
- `squashMergeInto` collapses two `wip` commits into one on `main`; `wip` and
  `main` then point at different commits, and `forceBranch(dir, wip, main)` makes
  `currentBranch`/`history` agree;
- **two consecutive checkpoints**: commit on `wip` → checkpoint → commit again on
  `wip` → checkpoint → assert `main` has exactly **two** checkpoint commits (no
  re-applied/duplicated content). This is the regression guard for the
  squash/reset bug.

### Step 2: `withWatcherPaused(fn)` on `SyncSession` + test

Add **one** public method, modeled exactly on `command()`:

```js
// Uruchom `fn` z wyłączonym watcherem (operacje gita zapisujące working tree —
// pull/checkout/merge — nie mogą wyzwolić hot-reloadu). Serializowane przez tę
// samą kolejkę co command(), z gwarantowanym wznowieniem watchera i przeliczeniem
// konfliktów po zakończeniu.
async withWatcherPaused(fn) {
  return this._enqueue(async () => {
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

Do not change anything else in `syncEngine.js`.

**Verify**: `npm test -- syncEngine`. New test (copy `syncEngine.watcher.test.js`
setup with an injected mock client): call `withWatcherPaused(async () => {...})`,
assert `watcherActive` is `false` *inside* `fn` and `true` after it resolves, and
that `refreshMismatches` ran (e.g. the mock client received a
`liquidFilesMetaGet`). Also assert a thrown `fn` still restarts the watcher
(`finally`).

### Step 3: Route auto-commit onto `wip`; add controller git methods

- **`_ensureWipBranch()`** (new private helper): given `this.activeGit.dir` with a
  repo present, create `liquidflow/wip` from `main` if missing and switch to it.
  Idempotent. Call it from `_doAutoCommit` (after `git.init` ensures a repo), from
  `gitEnable` (after init), and at session start when the repo already exists.
- **`_doAutoCommit`**: ensure `wip`, commit there, **remove the `autoPush` push
  block entirely** (wip is never pushed). Keep the `GitVersionSaved` log +
  `emitGit`.
- **`gitCheckpoint(message)`**:
  1. `clearTimeout(this._commitTimer)` and **flush** any pending auto-commit
     synchronously (`await this._doAutoCommit()`) so no debounced commit fires
     mid-checkpoint onto the wrong branch.
  2. Run the merge under the watcher pause via the session:
     `await this.state.session.withWatcherPaused(async () => { ... })` containing:
     `git.squashMergeInto(dir, 'liquidflow/wip', 'main', message)` →
     `git.forceBranch(dir, 'liquidflow/wip', 'main')` →
     `git.switchBranch(dir, 'liquidflow/wip')` (end back on wip) → if
     `activeGit.autoPush` (or an explicit push flag) `await git.push(dir, 'main')`.
  3. Log via `tmsg` (e.g. `GitCheckpointDone` / `GitNothingToCheckpoint` when the
     squash produced nothing), `emitGit`. `withWatcherPaused` already runs
     `refreshMismatches`.
  - **If there is no `state.session`** (git enabled but no active sync session),
    run the same git sequence directly (no watcher to pause) — but in practice a
    template with git always has a session; if that assumption is false, **STOP
    and report**.
- **`gitPull()`**: if `git.countCommits(dir, 'main..liquidflow/wip') > 0`, **block**:
  log + throw `new Error(this.t.GitPublishBeforePull)`. Else
  `await this.state.session.withWatcherPaused(() => git.pull(dir))`, then
  `emitGit`. (`withWatcherPaused` runs `refreshMismatches`.)
- **`gitCreateBranch(name)` / `gitSwitchBranch(name)`**:
  `withWatcherPaused(() => git.createBranch/switchBranch(dir, name))`, `emitGit`.
- **`gitListBranches()`**: `git.listBranches(dir)` (read-only, no pause).
- **`gitPush()`** (redefine): push **`main`** — `await git.push(this.activeGit.dir, 'main')`.

**Verify**: `npm test -- controller`. New/updated tests via the mock-SOAP seam:
- a sync that triggers `_doAutoCommit` lands the commit on `liquidflow/wip` and
  leaves `main` untouched (assert via `git.currentBranch` / `git.history` on the
  mode-`0` dir);
- `gitCheckpoint('msg')` produces **one** squashed commit on `main`, leaves the
  repo on `wip`, and `wip`/`main` point at the same commit;
- `gitPull()` throws/blocks (translated message) when `wip` is ahead of `main`.
Keep all existing controller tests green.

### Step 4: `/git` menu wiring (CLI) — gated on Step 0

Extend `gitMenu` (commands.js:255-302) with items, following the existing
`openPicker`/`openForm` shapes:
- **Checkpoint to main** — `openForm` for the message (like the remote-URL form),
  then `safe(() => ctrl.gitCheckpoint(v.message))`.
- **Pull from origin** — `safe(() => ctrl.gitPull())`.
- **Branch** — sub-picker: create (form for the name → `gitCreateBranch`) /
  switch (picker over `gitListBranches()` → `gitSwitchBranch`).
Keep the existing toggles (`AutoCommit`/`AutoPush`), `history`, `remote`, `push`
items. The `AutoPush` toggle label/help should reflect the new meaning
("push `main` after checkpoint") — update its i18n string, not the toggle wiring.
Destructive or history-affecting actions (Checkpoint, Pull, Switch) get the
`confirmStay`-style confirmation already used for bulk conflict ops.

**Verify**: `npm test -- commands.flows` covers the new routing + confirmation;
`node apps/cli/test/action-bottom.mjs` still clean if any overlay added.

### Step 5: i18n, changelog, docs, version

New keys (pl + en) for every label/log/error introduced (Checkpoint, Pull, Branch
create/switch, "checkpoint before pulling", "nothing to checkpoint", checkpoint
done, branch switched, etc.), plus the reworded `AutoPush` help. Update
`CHANGELOG.md` + bump the patch version in the three `package.json` files; refresh
the `/git` section in `README.md` to describe the wip → checkpoint → push flow and
pull.

**Verify**: i18n parity one-liner → `untranslated: []`. `npm test` fully green.

## Test plan

- **`git.test.js`** (new cases): `pull --ff-only`, bad-remote rejection for
  `pull`, `squashMergeInto` + `forceBranch`, **two consecutive checkpoints** (no
  duplication), branch create/switch/list, `countCommits` for ahead-detection,
  `push(dir, 'main')` — all against tmp + bare repos, copying the existing push
  test's structure.
- **`syncEngine.watcher.test.js`**: `withWatcherPaused` stops/restarts the watcher,
  runs `refreshMismatches`, and restarts even when `fn` throws.
- **`controller.test.js` / `controller.session.test.js`**: auto-commit lands on
  `liquidflow/wip` (main untouched, no push); `gitCheckpoint` → one squashed
  commit on `main`, repo back on `wip`; `gitPull` blocks when `wip` is ahead. Use
  the mock-SOAP seam (seed shop `Url` → mock server) per CLAUDE.md.
- **`commands.flows.test.js`**: `/git` menu exposes Checkpoint/Pull/Branch and
  routes them; destructive paths confirm.
- Verification: `npm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0; new git/syncEngine/controller/flows tests exist and pass.
- [ ] Hot-reload auto-commits land on `liquidflow/wip`; `main` only advances via
      `gitCheckpoint` (asserted by a controller test). `_doAutoCommit` never pushes.
- [ ] `git.pull` exists, uses the long timeout, and **rejects** (never hangs) on a
      bad remote (asserted in `git.test.js`).
- [ ] **Two consecutive checkpoints** produce two distinct commits on `main` with
      no duplicated content (asserted in `git.test.js`).
- [ ] `gitPull` blocks (with a translated message) when `wip` is ahead of `main`.
- [ ] Every new tree-mutating controller git op routes through
      `SyncSession.withWatcherPaused`; `restore` is unchanged.
- [ ] i18n parity one-liner prints `untranslated: []`.
- [ ] No files outside the in-scope list modified (`git status`); **no `clone`
      code added** (that is plan 007).
- [ ] Step 0 open questions recorded as resolved in "## Spike outcome";
      `plans/README.md` row updated.

## STOP conditions

Stop and report (do not improvise) if:

- "Current state" excerpts don't match live code (drift).
- A Step 0 answer must differ from the proposed design — confirm before wiring UI
  (Step 4).
- Implementing the watcher pause appears to require changing `command()`,
  `refreshMismatches`, or any watcher internal **other than** adding the single
  `withWatcherPaused` method — report the options instead.
- A template with git enabled turns out to have **no** `state.session`
  (`gitCheckpoint`/`gitPull` have nothing to pause) — the "always has a session"
  assumption is false; report.
- `pull --ff-only` would routinely fail because the real-world flow produces
  divergent branches (means the "checkpoint then pull" assumption is wrong — needs
  a merge strategy decision).
- Any new git op can hang in a test (means `GIT_TERMINAL_PROMPT`/timeout isn't
  covering it).

## Maintenance notes

- The watcher↔git interplay is the fragile part: any future git op that
  **re-baselines** the working tree (pull/checkout/merge) MUST go through
  `SyncSession.withWatcherPaused`. `restore` is the **deliberate exception** — it
  wants the watcher to propagate restored files to the shop; do not "fix" it.
- A reviewer should scrutinize: branch lifecycle (no orphaned/colliding `wip`),
  that `main` never receives raw sync commits, that the second checkpoint doesn't
  duplicate history, the `autoPush`-now-means-push-main change, and pull's
  block-when-ahead guard.
- **Mode `2` is not versioned.** The repo lives in mode-`0` only, but the watcher
  and sync cover both modes. Checkpoint/pull/push therefore version only mode-`0`
  files — consistent with today. Surfacing mode-`2` in git is out of scope.
- Deferred on purpose: `clone`/remote bootstrap (**plan 007**), auto-merge/rebase
  for divergent branches, per-branch remote tracking beyond `origin`, desktop
  parity. Conflict resolution of pulled changes is handled by plan 005's diff view
  (already merged).

## Spike outcome

- **Checkpoint Flow**: Implemented squash-merge (`squashMergeInto`) from `liquidflow/wip` to `main`, followed by forcing `liquidflow/wip` back to `main` (`forceBranch`) and switching back to `liquidflow/wip`. Verified that two consecutive checkpoints produce two distinct commits on `main` without duplicated content.
- **WIP Lifecycle**: Created a persistent local `liquidflow/wip` branch to receive all auto-commits.
- **Pull Workflow**: Fast-forwards `main` from origin and updates the local `wip` branch. Blocks with an error if there are uncheckpointed commits on `liquidflow/wip`.
- **autoPush**: Redefined to automatically push `main` to `origin` only after a Checkpoint (if enabled). Auto-commits never push.
- **Seam**: Added `SyncSession.withWatcherPaused` to pause the file watcher recursively and refresh mismatches after checkout, merge, and pull operations.
- **Deferred items**: Auto-merge/rebase strategies.
