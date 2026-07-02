# Plan 027: Post-migration bookkeeping & hygiene cleanup

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done (unless a
> reviewer maintains the index). You edit **only** the files named in Scope —
> no source/logic changes.
>
> **Drift check (run first)**:
> `git log --oneline -6` — confirm the top commit is `e79d473`
> (`refactor(desktop): attach main process to shared daemon…`). If HEAD has moved
> past that, re-read the "Current state" section against live files before editing;
> on a real mismatch (e.g. the CLI changelog gap is already filled), STOP and report.

## Status

- **Priority**: P3 (housekeeping — nothing depends on it; the architecture already
  works and is on `main`)
- **Effort**: S
- **Risk**: LOW (docs + lockfile only; zero application logic touched)
- **Depends on**: plans 022–025 (all DONE and merged to `main`).
- **Category**: docs / tech debt
- **Planned at**: `e79d473`

## Why this matters

Plans 022–025 (shared daemon + CLI/MCP/desktop migrations) landed on `main`,
fully green (317 unit + 5 e2e), but the migrations were run through parallel
executor worktrees and merged with sloppy git hygiene. Three bookkeeping gaps
survived the merge. None affect behavior — they hurt the **record** (a reader of
`CHANGELOG.md` can't see the CLI was migrated) and **reproducibility** (the
lockfile was rewritten back-and-forth ~23k lines across commits). This plan
closes those gaps and writes down the process rule that would have prevented them.

This is the **whole** scope. Do not "improve" the daemon code, do not touch the
duplicate commits already on `main` (history rewrite of a pushed shared branch is
explicitly out of scope — see STOP conditions).

## Current state (verified at `e79d473`)

1. **`CHANGELOG.md` is missing the CLI migration entry.** The top of the file has:
   - `## [0.9.144]` — Desktop attaches to shared daemon (plan 025)
   - `## [0.9.143]` — MCP attaches to shared daemon (plan 024)
   - `## [0.9.142]` — Hardened `DaemonClient.connect()` + Windows pipe (plan 026)
   - `## [0.9.141]` — Shared daemon foundation (plan 022)

   There is **no entry** for the CLI migration (plan 023), even though the code
   landed: `apps/cli/src/useController.js:58` calls `await connectController(...)`.
   `grep -ni "CLI.*daemon\|attaches to the shared daemon" CHANGELOG.md` finds the
   MCP/desktop lines but nothing crediting the CLI's own migration.

2. **The four version-locked `package.json` files are all at `0.9.144`** (root,
   `apps/cli`, `apps/mcp`, `packages/core`). `apps/desktop/package.json` is at
   `0.9.94` — this is a **pre-existing, separate track** (it was `0.9.91` before
   this run and is NOT one of the four files CLAUDE.md mandates bumping). **Leave
   desktop's version alone** — do not "sync" it to 0.9.144; that would be a wrong
   fix.

3. **`package-lock.json` was rewritten back-and-forth** across the migration
   commits. The final committed lock installs and tests pass, but it has not been
   confirmed to match a clean `npm install` (i.e. that the committed lock is the
   one npm would actually generate). This step just *verifies* it and commits a
   correction only if npm produces a diff.

4. **`CLAUDE.md`** has a "Konwencje kodu → Commity" section documenting the
   commit/version/changelog workflow, but says nothing about how to merge work
   done in **parallel executor worktrees** — which is what produced the duplicate
   commits (`654590d`+`d09fae3`, `64907f0`+`5eb8e8e`, `00ff661`+`e79d473`, each
   pair the same change with a double-space typo in one message) and the lockfile
   thrash now sitting in `main`'s history.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install / lock check | `npm install` | exit 0; ideally **no** change to `package-lock.json` |
| Tests (gate) | `npm test` | exit 0, green (still 317 passed) |
| Confirm CLI is migrated | `grep -n connectController apps/cli/src/useController.js` | shows the call |

## Scope

**In scope (the ONLY files you may edit):**
- `CHANGELOG.md` — add the missing CLI entry under a new version heading.
- `package.json`, `apps/cli/package.json`, `apps/mcp/package.json`,
  `packages/core/package.json` — bump the patch version by 1 (per CLAUDE.md, every
  commit bumps these four). **Not** `apps/desktop/package.json`.
- `package-lock.json` — **only if** `npm install` regenerates it differently
  (commit the npm-produced result; do not hand-edit).
- `CLAUDE.md` — append the parallel-worktree hygiene note (Step 3).

**Out of scope (hard):**
- Any file under `packages/core/src/**`, `apps/cli/src/**`, `apps/mcp/src/**`,
  `apps/desktop/**` — no logic changes. This is bookkeeping.
- **Rewriting git history** — do NOT rebase, squash, `git commit --amend`, or
  force-push to remove the duplicate commits already on `main`. They are pushed to
  a shared branch; rewriting is more dangerous than the cosmetic noise. Leave them.
- `apps/desktop/package.json` version — pre-existing separate track; do not touch.

## Git workflow

- Branch: `advisor/027-post-migration-bookkeeping`.
- Conventional Commits, English, **no `Co-Authored-By` footer**. Suggested:
  `docs: record CLI daemon migration in changelog + parallel-worktree hygiene note`.
- One commit is fine for the whole plan (it's small). Bump the four `package.json`
  files and add the CHANGELOG entry in the same commit.

## Steps

### Step 1: Bump version + add the missing CLI changelog entry

1. Read the current version from `package.json` (it is `0.9.144`). Increment the
   patch by 1 → `0.9.145` in **all four** files: `package.json`,
   `apps/cli/package.json`, `apps/mcp/package.json`, `packages/core/package.json`.
   **Do not touch `apps/desktop/package.json`.**
2. At the top of `CHANGELOG.md` (immediately under the `---` separator, above the
   `## [0.9.144]` block), add:

   ```markdown
   ## [0.9.145] — <today's date, YYYY-MM-DD>

   ### Changed

   - Recorded the CLI's shared-daemon migration in the changelog — the CLI now
     attaches to the daemon via `connectController()` like the MCP and desktop
     apps (plan 023); the entry was omitted when the parallel migration worktrees
     were merged.

   ### Fixed

   - Added a parallel-executor-worktree hygiene note to `CLAUDE.md` and verified
     `package-lock.json` matches a clean install after the daemon migrations.
   ```

   Use the real current date. Keep it under the `# Changelog` header and the intro
   lines — newest version on top, matching the existing format exactly.

**Verify**: `node -e "for (const p of ['package.json','apps/cli/package.json','apps/mcp/package.json','packages/core/package.json']) console.log(require('./'+p).version)"`
→ prints `0.9.145` four times. `head -20 CHANGELOG.md` shows the new block on top.

### Step 2: Verify lockfile integrity

Run `npm install` (no arguments — it reconciles `package-lock.json` against the
workspace `package.json` files). Then:

```
git status --porcelain package-lock.json
```

- **Empty output** → the committed lock already matches a clean install. Good —
  nothing to commit for the lock. (Note in NOTES: "lock verified clean".)
- **Shows `M package-lock.json`** → npm corrected drift; include the regenerated
  `package-lock.json` in your commit. **Do not** hand-edit it; commit exactly what
  npm produced. If the diff is enormous (thousands of lines re-ordering), that is
  expected given the history churn — it is npm normalizing the file; commit it.

**Verify**: after this step, `npm ci` (clean install from lock) would succeed —
you don't have to run the full `npm ci` (slow), but `npm install` must exit 0 and
leave a lockfile that `git diff` shows as either unchanged or a single coherent
npm-authored change.

### Step 3: Add the parallel-worktree hygiene note to `CLAUDE.md`

In `CLAUDE.md`, find the `- **Commity**:` bullet under `## Konwencje kodu`. After
that bullet (or the `- **Wersjonowanie …` bullet — pick the spot that reads best
next to the existing commit/version rules), add a new bullet **in Polish** (code
comments and CLAUDE.md prose are Polish per repo convention). Content to convey:

> When several plans/executors run in **parallel git worktrees** (e.g. dispatching
> migrations 023/024/025 at once), **squash or rebase each branch onto current
> `main` before merging**, and merge them **one at a time**, re-running the version
> bump at merge time. Merging parallel worktrees naively produces duplicate commits
> (the same change twice) and makes `package-lock.json` flip-flop thousands of
> lines back and forth — exactly what happened landing the daemon migrations
> (commits around `e79d473`). One clean commit per plan; verify `git log --oneline`
> has no duplicate messages before pushing.

Phrase it in your own Polish sentence(s) matching the surrounding style; the SHA
and the "duplicate commits / lockfile thrash" cause are the substance to keep.

**Verify**: `grep -n "worktree\|równoleg" CLAUDE.md` finds the new note (the exact
words depend on your phrasing; confirm the note is present under Konwencje kodu).

### Step 4: Gate + index

Run `npm test` — must be exit 0, still `317 passed`. This plan touches no logic,
so a red suite means something unrelated broke; STOP and report. Then update this
plan's row in `plans/README.md` to `DONE`.

**Verify**: `npm test` exit 0; `plans/README.md` row 027 = DONE.

## Done criteria

- [ ] Four locked `package.json` at `0.9.145`; `apps/desktop/package.json`
      **unchanged** at `0.9.94`.
- [ ] `CHANGELOG.md` top block `## [0.9.145]` credits the CLI migration (plan 023).
- [ ] `grep -ni "cli" CHANGELOG.md` now includes a line about the CLI *attaching
      to the shared daemon*, not just the incidental older CLI mentions.
- [ ] `npm install` exits 0; `package-lock.json` is either unchanged or a single
      npm-authored correction (no hand edits).
- [ ] `CLAUDE.md` has the parallel-worktree hygiene note under Konwencje kodu.
- [ ] `npm test` exit 0, `317 passed`.
- [ ] No files under `packages/core/src/**`, `apps/cli/src/**`, `apps/mcp/src/**`,
      or `apps/desktop/**` changed. `git diff --name-only <base>..HEAD` lists only
      the in-scope files.
- [ ] No git history rewrite (no force-push, no amend of existing `main` commits).

## Test plan

No new tests — this plan adds no logic. The regression guard is the existing
suite staying green (`npm test` → 317 passed) plus the lockfile check
(`npm install` exit 0). If `npm test` is red after doc-only edits, the tree was
already broken or a version-bump typo left an invalid `package.json`; fix the typo
or STOP.

## STOP conditions

- The CLI changelog gap is **already filled** (someone added a CLI daemon entry
  since `e79d473`) → the main fix is moot; do only Steps 2–3 if still relevant,
  and note it.
- `npm install` wants to change `package-lock.json` in a way that alters installed
  **dependency versions** (not just formatting/ordering) → that's a real
  dependency change, out of this plan's intent; STOP and report the diff rather
  than committing it.
- Any temptation to rebase/squash the duplicate commits on `main` → STOP. History
  rewrite of a pushed shared branch is out of scope by design.
- `npm test` goes red on doc-only changes → STOP; something unrelated is wrong,
  don't paper over it.

## Maintenance notes

- After this lands, `CHANGELOG.md` finally has one entry per shipped plan
  (022→025 + 026 + this) — keep that one-entry-per-commit discipline.
- The hygiene note in `CLAUDE.md` is the real prevention: future parallel-executor
  runs (very likely, since 022–025 set that pattern) should merge serially with a
  rebase, so `main` stops accumulating duplicate commits and lockfile thrash.
- The `apps/desktop/package.json` version drift (`0.9.94` vs `0.9.145`) is
  intentional-by-history, not a bug; if the team ever wants desktop on the unified
  version line, that's a separate, deliberate decision — not this plan.
