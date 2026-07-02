# Plan 007: Bootstrap a template from a remote git repo (`clone`)

> **Executor instructions**: This is a **design/spike plan**, split out of plan
> 006 because cloning collides with Liquid Flow's two-mode + external-meta layout
> and needs its own work. Deliver the `clone` git primitive plus a controller
> bootstrap flow that (a) clones mode-`0`, (b) **still downloads the other modes
> from SOAP**, and (c) **seeds `meta/` so the user is not buried in conflicts**.
> Run every verification command. If anything in "STOP conditions" occurs, stop
> and report. When done, update this plan's status row in `plans/README.md` and
> fill "## Spike outcome".
>
> **Depends on plan 006** (the `liquidflow/wip` branch model and
> `SyncSession.withWatcherPaused`). Do not start until 006 is DONE — a freshly
> cloned repo must adopt the same branch model.
>
> **Drift check (run first)**:
> `git diff --stat e2e008a..HEAD -- packages/core/src/git.js packages/core/src/syncEngine.js packages/core/src/store.js packages/core/src/controller.js`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code first; on a mismatch, STOP. (Note: plan
> 006 will have changed `git.js`, `syncEngine.js`, and `controller.js` — that is
> expected; re-read those files and confirm the bootstrap composes with 006's
> additions before proceeding.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (writes a fresh template tree from an untrusted remote; must not
  leave a half-populated template or a wall of false conflicts)
- **Depends on**: **plan 006** (branch model + `withWatcherPaused`). Synergy with
  plan 005 (diff view) for resolving any genuine post-clone conflicts.
- **Category**: direction
- **Planned at**: commit `e2e008a`, 2026-06-29

## Why this matters

Today a teammate (or the same dev on a new machine) cannot bootstrap a template
from GitHub through the app — the only way to get files locally is the initial
SOAP download (`SyncSession._initialDownload`). Plan 006 adds `pull` but
deliberately left `clone` out, because cloning is **not** a drop-in replacement
for the initial download in this app:

1. **Templates have two real file sets (modes `0` and `2`).** The git repo lives
   in mode-`0` only, but both modes are downloaded, watched, and synced. A
   `git clone` restores **only mode-`0`** — mode-`2` would be missing.
2. **Sync metadata lives outside the repo.** `meta/<id>.json` (the
   local↔remote timestamps used for conflict detection) sits in
   `Shops/<Name>/meta/`, not in `files/<id>/`. A clone brings no meta, so
   `refreshMismatches` would flag **every** cloned file as a conflict.

This plan makes clone a first-class, correct bootstrap: clone mode-`0`, fetch the
remaining modes from SOAP, and seed `meta/` so only genuinely diverged files show
up as conflicts.

## Current state

- **`packages/core/src/store.js`** — the data layout:
  - `templateDir(shopName, templateId)` (store.js:101) = `files/<id>/` — the
    parent that contains **both** mode subdirs.
  - `templateModeDir(shopName, templateId, mode)` (store.js:105) = `files/<id>/<mode>/`
    — the git repo lives in mode `0`.
  - `metaDir(shopName)` (store.js:108) = `Shops/<Name>/meta/`; `meta/<id>.json`
    holds `{ "<mode>/<name>": { localts, remotets } }`.
  - `setMetaEntry(shopName, templateId, mode, name, localts, remotets)`
    (store.js:207), `loadMeta` (store.js:196), `mtimeUtc` (store.js:160),
    `isSafeRelName` (store.js:138), `listLocalFiles` (store.js:169).

- **`packages/core/src/syncEngine.js`**:
  - `SyncSession.start()` (syncEngine.js:80) decides "fresh" via
    `const fresh = !fs.existsSync(dir) || (localFiles.length === 0 && !git.isRepo(dir));`
    where `dir = store.templateDir(...)` (the **parent**, not the mode-`0` repo).
    Note `git.isRepo(templateDir)` checks `files/<id>/.git`, which never exists
    (the repo is in `files/<id>/0/.git`) — so today the "fresh" decision is
    effectively `localFiles.length === 0`. After a clone, mode-`0` files exist,
    so `fresh` would be `false` and `_initialDownload` would be **skipped** — i.e.
    mode-`2` would never download. The bootstrap must therefore drive the
    "download the other modes" step itself, **not** rely on `start()`.
  - `_initialDownload()` (syncEngine.js:138) fetches **all** modes via
    `client.liquidFilesGet({ TemplateId })` and seeds meta per file
    (syncEngine.js:152) — the model to follow for the non-cloned modes.
  - `refreshMismatches()` (syncEngine.js:276): for a file present on both sides,
    `localChanged = !m || !tsEqual(...)` — i.e. **no meta entry ⇒ conflict**
    (syncEngine.js:318). This is why meta must be seeded after clone.
  - `liquidFilesMetaGet({ TemplateId })` returns `[{ Mode, Name, Date }]` (remote
    timestamps) — used by `refreshMismatches`; reuse it to seed meta.

- **`packages/core/src/git.js`** — after plan 006 it has `pull`, `currentBranch`,
  branch ops, etc. **No `clone`.** `run(cwd, args, opts)` (git.js:15) is the
  execFile wrapper with `GIT_TERMINAL_PROMPT=0` + empty `GIT_ASKPASS` and the 60s
  push timeout constant to reuse for clone.

- **`packages/core/src/controller.js`** — `_startSession` (around controller.js:300)
  builds the `SyncSession`, sets `this.activeGit = { dir: templateModeDir(...,0), … }`.
  After 006 it has `gitPull`, `_ensureWipBranch`, etc. The clone flow is a new
  controller method invoked from `/git` (or the connect flow) **before** a normal
  session start, when the mode-`0` dir has no template files.

- **Test exemplars:** `packages/core/src/git.test.js` (real git + local bare repo;
  copy for clone), `controller.session.test.js` (mock-SOAP seam; copy for the
  bootstrap-with-mode-2 + meta-seeding test).

### Conventions

- **i18n**: new user-visible strings → keys in **both** `pl` and `en` tables of
  `translations.js` (model on the `Git*` block). Technical git strings stay
  English in `git.js`.
- **Untrusted remote.** A cloned tree is data from an external source. Every file
  name written must pass `store.isSafeRelName` before any local write (the same
  gate `_initialDownload`/`_download` already apply to SOAP-supplied names). Do
  **not** trust paths inside the cloned repo blindly.
- **No new deps.** `execFile('git', …)` through `run`.
- **Versioning/changelog** (CLAUDE.md): bump the patch version in all three
  `package.json` and add a `CHANGELOG.md` section per commit.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests (gate) | `npm test` | exit 0, all green |
| Git suite | `npm test -- git` | pass (or skip if no git) |
| Controller suite | `npm test -- controller` | pass |
| i18n parity | (the one-liner from plan 006 / CLAUDE.md) | `untranslated: []` |

No typecheck/lint script — `npm test` is the gate.

## Scope

**In scope:**
- `packages/core/src/git.js` — add `cloneInto(dir, url)`: clone `url` into `dir`
  (the **mode-`0`** dir), long timeout, **guard a non-empty target dir** (refuse
  to clone over existing files), reject (not hang) on a bad/unreachable remote.
- `packages/core/src/git.test.js` — clone from a seeded bare repo into an empty
  dir; bad remote → reject; non-empty dir → refuse.
- `packages/core/src/controller.js` — add `gitClone(url)` bootstrap:
  1. precondition: mode-`0` dir has no template files (else STOP/return a
     translated error);
  2. `git.cloneInto(mode0Dir, url)`;
  3. adopt the 006 branch model on the clone (`_ensureWipBranch`);
  4. **download the non-cloned modes** from SOAP (everything `liquidFilesGet`
     returns whose `Mode !== 0`), via the same write+meta path as
     `_initialDownload`, honoring `isSafeRelName`;
  5. **seed `meta/` for the cloned mode-`0` files**: fetch remote meta
     (`liquidFilesMetaGet({ TemplateId })`); for each cloned local file, write a
     meta entry with `localts = store.mtimeUtc(localPath)` and `remotets =` the
     remote `Date` when the file exists remotely (leave unset/conflict only when
     it genuinely differs or is remote-missing);
  6. start the session normally and `refreshMismatches`.
- `packages/core/src/store.js` — only if a small helper is genuinely needed (e.g.
  "list local files for a single mode"); prefer reusing `listLocalFiles` +
  filtering by mode. Do not change existing signatures.
- `packages/core/src/controller.test.js` / `controller.session.test.js` — cover
  the bootstrap via the mock-SOAP seam.
- `packages/core/src/translations.js` — new keys (pl + en).
- `apps/cli/src/commands.js` — `/git` (or `/connect`) entry point: when no local
  files and a remote URL is known/entered, offer **Clone from remote**
  (`openForm` for the URL, like the remote-URL form). Gated on the design
  decisions in Step 0.
- `apps/cli/src/commands.flows.test.js` — cover the clone menu routing.
- `CHANGELOG.md`, the three `package.json` versions, `README.md` git section.

**Out of scope (do NOT touch):**
- The plan-006 branch/checkpoint/pull logic (reuse it; don't re-implement).
- `apps/desktop/**`.
- The SOAP contract in `soap.js`.
- Auto-detecting a remote URL from anywhere other than the existing
  `git.getRemote` / explicit user entry.
- Changing how `start()` computes "fresh" — the bootstrap drives downloads
  explicitly instead.

## Step 0: Confirm before wiring (DESIGN GATE)

Validate by prototyping (Steps 1-2) and confirm if any answer must differ:

1. **Where the user triggers clone.** Default: a **Clone from remote** item that
   appears when the mode-`0` dir has no template files (in `/git`, or the connect
   flow). Confirm the entry point.
2. **Modes to fetch from SOAP after cloning.** Default: clone restores mode-`0`;
   fetch **all other modes** returned by `liquidFilesGet({ TemplateId })`. Confirm
   there is no mode the clone should also own.
3. **Meta seeding policy.** Default: for a cloned file that exists remotely with a
   matching name, seed `remotets` from the remote meta so it is **not** flagged as
   a conflict; files that differ in content still surface (timestamps won't match)
   and are resolved with plan 005's diff. Confirm this is the desired "clean
   bootstrap" behavior (vs. deliberately showing all as conflicts).
4. **Clone-over-existing.** Default: **refuse** to clone when the mode-`0` dir is
   non-empty; the user must remove/relocate first. Confirm.

**STOP and report** if any can't be answered as proposed. Record answers in
"## Spike outcome".

## Steps

### Step 1: `cloneInto(dir, url)` primitive + tests

```js
export async function cloneInto(dir, url) {
  // Guard: never clone over an existing non-empty working dir.
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir);
    if (entries.length) throw new Error('Target directory is not empty');
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
  const r = await run(path.dirname(dir), ['clone', url, path.basename(dir)],
    { allowFail: true, timeout: GIT_PUSH_TIMEOUT_MS });
  if (r.failed) throw new Error(r.stderr || 'git clone failed');
  return status(dir);
}
```

**Verify**: `npm test -- git`. New tests, mirroring git.test.js:
- create a bare repo, push a seed commit (reuse the push test setup), then
  `cloneInto(empty, bareUrl)` → repo present, seed file on disk;
- bad/unreachable remote → `cloneInto` **rejects** (copy the bad-remote push test);
- non-empty target dir → `cloneInto` rejects with "not empty".

### Step 2: `gitClone(url)` bootstrap (controller)

Implement the 6-step flow from Scope. Pseudocode shape:

```js
async gitClone(url) {
  if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
  const dir = this.activeGit.dir; // mode-0 dir
  if (store.listLocalFiles(this.currentShop().Name, tplId).some(f => f.mode === 0))
    throw new Error(this.t.GitCloneDirNotEmpty);
  await git.cloneInto(dir, url);
  await this._ensureWipBranch();                 // from plan 006
  // fetch non-0 modes from SOAP (reuse the _initialDownload write+meta path)
  // seed meta for cloned mode-0 files from liquidFilesMetaGet
  // (re)start the session against the populated tree and refreshMismatches
}
```

Reuse the session for SOAP calls (`this.state.session.client` /
`liquidFilesGet` / `liquidFilesMetaGet`). Honor `store.isSafeRelName` on every
written name. Log via `tmsg` (cloned, downloading other modes, ready / errors).

**Verify**: `npm test -- controller`. New test via the mock-SOAP seam:
- seed a bare repo representing mode-`0`; configure the mock SOAP to return files
  in **both** mode `0` and mode `2`; run `gitClone(bareUrl)`;
- assert mode-`2` files are on disk after the bootstrap (clone alone wouldn't
  bring them);
- assert `refreshMismatches` reports **no conflicts** for files that match on both
  sides (meta was seeded) — i.e. the user is not buried in false conflicts.

### Step 3: CLI entry point — gated on Step 0

Add a **Clone from remote** action (form for the URL, `confirmStay`-style
confirmation since it writes a fresh tree) where Step 0 decided. Route to
`ctrl.gitClone(url)`.

**Verify**: `npm test -- commands.flows` covers the routing; `node
apps/cli/test/action-bottom.mjs` still clean if an overlay is added.

### Step 4: i18n, changelog, docs, version

New keys (pl + en) for every label/log/error. Update `CHANGELOG.md`, bump the
patch version in the three `package.json` files, and document clone in the
`README.md` git section.

**Verify**: i18n parity one-liner → `untranslated: []`. `npm test` fully green.

## Test plan

- **`git.test.js`**: `cloneInto` happy path (from a seeded bare repo), bad-remote
  rejection, non-empty-dir refusal.
- **`controller.session.test.js`**: `gitClone` brings mode-`2` files (not just
  mode-`0`) and seeds meta so matching files are **not** conflicts; clone over a
  non-empty mode-`0` dir is refused.
- **`commands.flows.test.js`**: the Clone action routes to `gitClone`.
- Verification: `npm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0; new git/controller/flows tests exist and pass.
- [ ] `git.cloneInto` exists, uses the long timeout, **rejects** (never hangs) on a
      bad remote, and **refuses** a non-empty target dir (asserted in `git.test.js`).
- [ ] `gitClone` populates **all** modes (mode-`2` present after a clone that only
      carried mode-`0`) — asserted by a controller test.
- [ ] After `gitClone`, files matching on both sides are **not** reported as
      conflicts (meta seeded) — asserted by a controller test.
- [ ] Cloned tree adopts the plan-006 branch model (`liquidflow/wip` exists).
- [ ] Every locally written name passed `store.isSafeRelName`.
- [ ] i18n parity one-liner prints `untranslated: []`.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] Step 0 answers recorded in "## Spike outcome"; `plans/README.md` row updated.

## STOP conditions

Stop and report (do not improvise) if:

- "Current state" excerpts don't match live code (drift) — including if plan 006's
  additions are not present (this plan depends on them).
- The mock SOAP cannot represent multi-mode files for the bootstrap test (means
  the meta-seeding behavior can't be verified — fix the test harness, don't skip).
- Seeding meta still leaves matching files flagged as conflicts (the timestamp
  comparison in `refreshMismatches` needs different handling than assumed).
- Any clone op can hang in a test (timeout/`GIT_TERMINAL_PROMPT` not covering it).

## Maintenance notes

- The two-mode + external-meta layout is the reason clone is non-trivial: clone
  owns mode-`0` only; SOAP owns the rest; meta lives outside the repo. Any future
  change to where the repo lives, to the mode set, or to meta location must
  revisit this bootstrap.
- A reviewer should scrutinize: the non-empty-dir guard, that **all** modes land
  on disk, the meta-seeding (no false-conflict wall and no *missed* real
  conflicts), and `isSafeRelName` coverage on the cloned tree.
- Deferred on purpose: auto-detecting remote URLs, partial/sparse clones, desktop
  parity.

## Spike outcome

- **Entry Point**: Added a "Clone from remote" option to the git menu when no git repository is present.
- **Modes to fetch**: Clones the mode-0 repository, then fetches all other modes (e.g. mode 2) from SOAP.
- **Meta-seeding policy**: Local mtime is recorded in localts, and remote file Date is recorded in remotets, matching remote timestamps to prevent a false-conflict wall on startup.
- **Clone-over-existing**: Guarded and refused clone if the target mode-0 directory is not empty.
- **WIP branch integration**: Automatically switched the cloned repository to the `liquidflow/wip` branch immediately after cloning.
- **Deferred items**: Desktop app parity, auto-detecting remote URLs.
