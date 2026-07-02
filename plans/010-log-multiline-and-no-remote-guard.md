# Plan 010: Fix log-render breakage from multi-line entries + graceful "no remote" guard

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in "STOP
> conditions" occurs, stop and report — do not improvise. Do NOT weaken existing
> tests. When done, do NOT edit `plans/README.md` — your reviewer maintains the
> index.
>
> **Baseline**: this plan assumes plan **008** is merged to `main` (HEAD =
> `4a2d437`, version 0.9.116). If `git rev-parse HEAD` is not a descendant of
> `4a2d437`, STOP — the base is wrong.
>
> **Drift check (run first)**:
> `git diff --stat 4a2d437..HEAD -- packages/core/src/log.js packages/core/src/controller.js`
> If either file changed since this plan was written, compare the "Current state"
> excerpts against the live code first; on a mismatch, STOP.

## Status

- **Priority**: P1 (visible UI corruption in normal use)
- **Effort**: S–M
- **Risk**: LOW (log-text sanitization is central and additive; remote guard is a
  pre-check that only short-circuits an already-failing path)
- **Depends on**: plan 008 (merged). Independent of 009.
- **Category**: bug
- **Planned at**: commit `4a2d437`, 2026-06-29

## Why this matters

In normal use the CLI log gets corrupted: a single log entry that contains
**embedded newlines** (raw `git` stderr — e.g. `fatal: 'origin' does not appear to
be a git repository\nfatal: Could not read from remote repository.\n\nPlease make
sure…`) is rendered as **several terminal lines**, but the log renderer counts it
as **one** visual line. `LogPane`'s row budget then overflows and Ink
duplicates/garbles the frame (the "rozdwojenie" CLAUDE.md warns about). Observed
after the 006/007 git work added `pull`/`checkpoint`/`push` paths that surface
multi-line git stderr via `SyncSession.withWatcherPaused`'s `catch { logErr(e.message) }`.

Two fixes:
1. **Root cause (UI):** sanitize entry text to a single line *centrally* in
   `log.js` so **no** entry — from git, exceptions, or anywhere — can ever be
   multi-line. This fixes the renderer for all sources and keeps persisted history
   single-line too.
2. **Secondary (functional):** `pull`/`push`/checkpoint-push attempt to contact
   `origin` even when no remote is configured, producing the fatal git output in
   the first place. Pre-check `git.getRemote(dir)` and emit a clean translated
   message instead.

Fix #1 alone removes the visible corruption; fix #2 makes the no-remote case
readable.

## Current state

- **`packages/core/src/log.js`** — `renderText(e)` (log.js:49-57) is the **single
  choke point** that computes `Text` for every entry (live entries, loaded history,
  and on language change). It returns either the i18n-rendered string or the raw
  literal:
  ```js
  function renderText(e) {
    if (e.kind === 'separator') { /* … single-line label … */ }
    if (e.msg) return tfmt(translationsFor(lang)[e.msg] || e.msg, e.params || {});
    return e.Text;                       // ← raw literal (e.g. git stderr) passes through unchanged
  }
  ```
  `Text` is assigned from `renderText` before an entry is pushed (log.js:119:
  `e.Text = renderText(e)`) and stored to the per-template `.jsonl` history, so
  sanitizing here keeps both the live log and the saved history single-line.

- **`apps/cli/src/components/LogPane.jsx`** — `buildVlines(log, wrap, cols)`
  (LogPane.jsx:28). In the **default (non-`/wrap`) path** it pushes each entry as a
  single vline with `trunc:true` (LogPane.jsx:46), rendered as
  `<Text wrap="truncate-end">`. `truncate-end` clips width but does **not** strip
  `\n` — an entry containing newlines renders as multiple terminal lines while
  `buildVlines` counts it as one ⇒ the row-budget math in `LogPane` overflows.
  (Do **not** fix it here — fixing in `log.js` covers desktop too and keeps the
  stored history clean. This file is reference only.)

- **`packages/core/src/syncEngine.js`** — `withWatcherPaused`/`runExclusive`
  `catch (e) { logErr(e.message); throw e; }` (syncEngine.js:~349, ~391) is what
  logs raw git stderr. Leave it as-is: once `log.js` sanitizes, this is safe.

- **`packages/core/src/controller.js`** (post-008):
  - `gitPull()` (controller.js:563-592) calls `git.pull(dir)` inside
    `withWatcherPaused(pullFn)` with **no remote pre-check**:
    ```js
    const pullFn = async () => {
      await git.switchBranch(dir, 'main');
      try { await git.pull(dir); logbuf.logOk(logbuf.tmsg('GitPullSuccess')); }
      finally { await git.forceBranch(dir, 'liquidflow/wip', 'main'); await git.switchBranch(dir, 'liquidflow/wip'); }
    };
    ```
  - `gitPush()` calls `git.push(this.activeGit.dir, 'main')` with no remote
    pre-check (the method just above `gitSetRemote`, ~controller.js:525-535).
  - `gitCheckpoint` pushes inside its `checkpointFn` only `if (this.activeGit.autoPush)`,
    already wrapped in its own `try/catch` logging `GitPushError` (controller.js:~538-541).
  - `git.getRemote(dir)` (git.js:95) returns the `origin` URL or **`null`** when no
    remote is set — the primitive for the guard.

- **i18n** — add keys to **both** `pl` and `en` tables of `translations.js`
  (model on the `Git*` block, e.g. `GitRemoteSet` at pl ~translations.js:128). The
  technical git stderr stays English by design; the new guard message is UI text →
  translate it.

### Conventions

- ESM, Node 18+. Comments in Polish; user-visible strings in both pl+en.
- No new deps.
- Versioning/changelog (CLAUDE.md): bump the patch in all three `package.json`
  (read the current value — should be `0.9.116` post-008 — and increment) and add a
  `CHANGELOG.md` section.
- Test gate: `npm test` 100% green (Vitest). New logic gets a test.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Full gate | `npm test` | exit 0, all green |
| log suite | `npx vitest run packages/core/src/log.test.js` | pass |
| controller suite | `npx vitest run packages/core/src/controller.session.test.js` | pass |
| i18n parity | `node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;console.log('missing-en:',Object.keys(pl).filter(k=>en[k]===undefined));console.log('untranslated:',Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k])))})"` | `missing-en: []` / `untranslated: []` |

## Scope

**In scope:**
- `packages/core/src/log.js` — sanitize multi-line/control-char text to one line in
  `renderText`.
- `packages/core/src/log.test.js` — test the sanitization (create if absent;
  otherwise add a case).
- `packages/core/src/controller.js` — remote pre-check in `gitPull` and `gitPush`
  (and skip the checkpoint auto-push cleanly when no remote): if
  `git.getRemote(dir)` is `null`, emit `GitNoRemoteConfigured` and do not attempt
  the network op.
- `packages/core/src/translations.js` — `GitNoRemoteConfigured` (pl + en).
- A controller test (`controller.session.test.js`) for the no-remote guard.
- `README.md` (note the no-remote behavior if the `/git` section needs it),
  `CHANGELOG.md`, the three `package.json`.

**Out of scope (do NOT touch):**
- `LogPane.jsx`/`buildVlines` (fix belongs in `log.js`; this keeps desktop + stored
  history correct too).
- `syncEngine.js` (its raw `logErr(e.message)` is fine once `log.js` sanitizes).
- The 008 serialization logic, the diff/conflict code, `soap.js`, `apps/desktop/**`.
- Do not change `git.push`/`git.pull` semantics — only add controller-level
  pre-checks.

## Steps

### Step 1: Sanitize entry text to a single line in `log.js`

In `renderText`, collapse any run of CR/LF/TAB (and stray control chars) into a
single readable separator, so the returned `Text` is always one line. Apply it to
the computed value before returning (covers both the i18n branch and the literal
branch). Keep the separator branch single-line as today. Suggested helper:

```js
// Spłaszcz tekst wpisu do JEDNEGO wiersza — surowy stderr gita bywa wielolinijkowy,
// a LogPane liczy 1 wpis = 1 wiersz; osadzony \n rozsadza budżet (duplikacja kadru).
function oneLine(s) {
  return String(s).replace(/[\t\f\v]+/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ⏎ ').trim();
}
```
Then return `oneLine(...)` for the `e.msg` and literal branches (the separator
branch is already single-line; you may leave it or wrap it too).

**Verify**: add/extend `packages/core/src/log.test.js` — push a literal entry whose
text contains `\n` (e.g. `"fatal: x\nfatal: y\n\nPlease…"`) and assert the entry's
`Text` contains **no** `\n`/`\r` and collapses to a single line (e.g.
`expect(entry.Text).not.toMatch(/[\r\n]/)`). Also assert a normal single-line
message is unchanged except trimming. `npx vitest run packages/core/src/log.test.js`
→ pass.

### Step 2: No-remote guard in `gitPull` / `gitPush` (+ checkpoint push)

Add a tiny pre-check before any network op. In `gitPull` and `gitPush`:

```js
const remote = await git.getRemote(this.activeGit.dir);
if (!remote) { logbuf.logErr(logbuf.tmsg('GitNoRemoteConfigured')); return this.gitStatus(); }
```
- `gitPull`: place it **before** the `withWatcherPaused(pullFn)` call (after the
  `ahead`/repo checks).
- `gitPush`: place it before `git.push(...)`.
- `gitCheckpoint` auto-push: inside `checkpointFn`, guard the `if (this.activeGit.autoPush)`
  push with the same `getRemote` check — if no remote, **skip the push** and log
  `GitNoRemoteConfigured` (the checkpoint itself still succeeds locally).

Add `GitNoRemoteConfigured` to `translations.js` (pl + en), e.g.
pl: `'Git: brak skonfigurowanego zdalnego repozytorium (ustaw przez /git → remote)'`,
en: `'Git: no remote configured (set one via /git → remote)'`.

**Verify**: in `controller.session.test.js` add a test: connect + select + `gitEnable`
(repo, **no remote**), then `await ctrl.gitPull()` resolves without throwing and
does **not** attempt a network pull (assert it returns a status and logs the
no-remote message — e.g. spy the log buffer or assert `git.currentBranch` is still
`liquidflow/wip` and no error was thrown). `npx vitest run packages/core/src/controller.session.test.js` → pass.

### Step 3: docs / version / changelog

- If the `/git` README section implies push/pull always work, add one line that a
  remote must be configured first.
- Bump the patch version in all three `package.json`; add a `CHANGELOG.md` section
  (Fixed: multi-line log entries corrupting the TUI; Added/Changed: clean
  no-remote message for push/pull).

**Verify**: i18n parity one-liner → `missing-en: []` / `untranslated: []`.
`npm test` fully green.

## Test plan

- **`log.test.js`**: multi-line literal → single-line `Text` (no `\r`/`\n`); normal
  message unaffected.
- **`controller.session.test.js`**: `gitPull` with no remote logs
  `GitNoRemoteConfigured` and does not throw / does not hang on a network call.
- Verification: `npm test` → all green.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0, all green.
- [ ] A log entry containing `\n` renders with no embedded newline (asserted in
      `log.test.js`); fix lives in `log.js` (`LogPane.jsx` untouched).
- [ ] `gitPull`/`gitPush` with no configured remote emit `GitNoRemoteConfigured`
      and do not attempt the network op (asserted by a controller test).
- [ ] `GitNoRemoteConfigured` present in pl + en; i18n parity clean.
- [ ] Versions bumped (3×); `CHANGELOG.md` entry added.
- [ ] No files outside the in-scope list modified.

## STOP conditions

- HEAD is not a descendant of `4a2d437` (008 not merged) — the base is wrong.
- "Current state" excerpts don't match live code (drift).
- Sanitizing in `renderText` breaks existing log/separator/i18n tests in a way that
  implies entries legitimately need newlines — report instead of forcing.
- The no-remote guard changes the result shape other tests rely on — report.

## Maintenance notes

- `renderText` is now the guarantee that **every** log entry is single-line; any
  future log source (new exceptions, new git ops) is covered automatically. Keep
  raw multi-line text out of `Text`; if a full multi-line payload is ever needed,
  surface it through `/wrap` or a dedicated view, not the default log line.
- Reviewer should check: no `\n` can reach `LogPane` via `Text`; the no-remote
  guard short-circuits *before* the watcher-pause/network call (so it can't half-run
  a checkout/forceBranch sequence).
- Related: plan 009 (clone-bootstrap reachability) is independent.
