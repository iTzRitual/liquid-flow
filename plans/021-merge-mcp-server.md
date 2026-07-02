# Plan 021: Land the MCP server (plan 020) onto `main` — conflict-resolved merge

> **Executor instructions**: This is a small, mechanical integration task, but
> it has one real gotcha (a version-number collision across four files). Follow
> it exactly. Run every verification command. If a STOP condition fires, stop
> and report.

## Status

- **Priority**: P1 (finished, reviewed work is stranded on an unmerged branch)
- **Effort**: S
- **Risk**: LOW (mechanical merge; the post-merge `npm test` gate re-verifies)
- **Depends on**: plan 020 (implemented on branch, see below)
- **Category**: integration / release
- **Planned at**: commit `ac9b93a` (main), 2026-07-02 (root version 0.9.139)

## Why this matters

Plan 020's MCP server was implemented and reviewed on the branch
`origin/subagent-Executor-for-Plan-020-self-250ed085` (single commit `30820c9`,
"feat(mcp): add MCP server exposing sync/conflicts/log/git to AI agents"). The
code is correct and its 8 integration tests were run green by the executor — an
independent static re-review (this session) confirmed: all 14 tools faithful to
the plan, `resolve_conflict` threads the mismatch `Type` into `runCommand`, no
credential leakage, no `console.*` on stdout, correct v1-SDK usage.

**But the work is NOT on `main`, and it will NOT merge cleanly.** The branch was
cut from `2a0d9d2` (where the plan was written, root version `0.9.137`) and
bumped every version file to `0.9.138`. Meanwhile `main` advanced two commits to
`ac9b93a` and is now at `0.9.139`. A plain `git merge` therefore conflicts on
**four files** — `package.json`, `apps/cli/package.json`,
`packages/core/package.json` (all three: `0.9.138` vs `0.9.139`), and
`CHANGELOG.md` (both added a top section). The executor's advice to run
`git merge <branch>` as-is is wrong and will drop the user into an unresolved
conflict state.

This plan lands the branch by resolving those four conflicts deterministically:
keep `main`'s history, re-bump to `0.9.140` across **all four** package files
(including the new `apps/mcp/package.json`), and merge the two changelog
sections into one clean entry.

## Current state (facts, verified this session)

- Branch to merge: `origin/subagent-Executor-for-Plan-020-self-250ed085` @ `30820c9`.
  Merge-base with `main` is `2a0d9d2`.
- `main` @ `ac9b93a`, all three tracked `package.json` files at `0.9.139`.
  Top of `CHANGELOG.md` on main is the `## [0.9.139]` section.
- The branch adds `apps/mcp/` (package.json, bin/liquidflow-mcp.js,
  src/server.js, src/server.test.js), one line in `vitest.config.js`, README and
  CLAUDE.md sections, a `## [0.9.138]` changelog section, and version bumps.
  Its `apps/mcp/package.json` version is `0.9.138`.
- The branch's non-version files (`apps/mcp/**`, `vitest.config.js`,
  `README.md`, `CLAUDE.md`, `package-lock.json`) merge **without conflict** — only
  the three package versions and `CHANGELOG.md` collide.
- **`plans/` is tracked on `main` again** (re-tracked in `6dc5c68`). The branch
  was cut before that, so it carries no `plans/` changes — no conflict there,
  but the index must be corrected by hand (this plan's Step 4).
- **SDK reality**: the branch correctly uses `@modelcontextprotocol/sdk@^1`
  (resolves to `1.29.0`) with `zod@^3` and deep imports
  (`@modelcontextprotocol/sdk/server/mcp.js`, `.../client/index.js`,
  `.../inMemory.js`). The split `@modelcontextprotocol/server`/`client` packages
  exist only at `2.0.0-beta.1` (no stable `^1`), so the unified v1 SDK is the
  right dependency. Do **not** "upgrade" this to the split packages.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Fetch branch | `git fetch origin subagent-Executor-for-Plan-020-self-250ed085` | exit 0 |
| Start merge | `git merge --no-ff origin/subagent-Executor-for-Plan-020-self-250ed085` | reports conflicts in 4 files |
| Install (lockfile refreshed by merge) | `npm install` | exit 0 |
| Gate | `npm test` | exit 0, 100% green, includes `apps/mcp/src/server.test.js` |
| Smoke | see plan 020 Step 3 (stdio `initialize`) | one JSON-RPC line on stdout, nothing else |

## Scope

**In scope**: resolving the merge (the four conflicted files), the resulting
merge commit, `package-lock.json` (refreshed by `npm install`), and
`plans/README.md` (index status). No source edits beyond conflict resolution.

**Out of scope**: any change to `apps/mcp/**` source, `server.js` logic, tool
behavior, or the SDK dependency choice. If you feel one is needed, that is a
STOP condition — the code was already reviewed and approved; this plan only
integrates it.

## Steps

### Step 1: Start the merge on `main`

Confirm you are on `main` and clean (`git status`), then:

```
git fetch origin subagent-Executor-for-Plan-020-self-250ed085
git merge --no-ff origin/subagent-Executor-for-Plan-020-self-250ed085
```

Expect: `CONFLICT (content)` in `package.json`, `apps/cli/package.json`,
`packages/core/package.json`, `CHANGELOG.md`. All other files auto-merge.

**Verify**: `git status --short` shows `UU` on exactly those four files and `A`
on the `apps/mcp/**` files. If any file **other** than those four is `UU`, STOP.

### Step 2: Resolve the three `package.json` conflicts → `0.9.140`

For each of `package.json`, `apps/cli/package.json`,
`packages/core/package.json`: the only conflicting hunk is the `"version"`
line (`0.9.139` from main vs `0.9.138` from the branch). Resolve by setting it
to **`0.9.140`** (a fresh patch above main's current `0.9.139`) and removing the
conflict markers.

Then set `apps/mcp/package.json` `"version"` to the same **`0.9.140`** (it is not
conflicted — it's a new file at `0.9.138` — but the four versions must match).

**Verify**:
`grep -h '"version"' package.json apps/cli/package.json packages/core/package.json apps/mcp/package.json`
→ all four print `0.9.140`, and
`grep -rn '<<<<<<<\|>>>>>>>' package.json apps/cli/package.json packages/core/package.json`
→ no matches.

### Step 3: Resolve the `CHANGELOG.md` conflict

Keep main's `## [0.9.139]` section intact. Replace the branch's `## [0.9.138]`
section with a single new **`## [0.9.140]`** section at the very top (above
`[0.9.139]`), carrying the MCP entry:

```
## [0.9.140] — 2026-07-02
### Added
- Added `@liquidflow/mcp`, an MCP (Model Context Protocol) server workspace
  exposing sync, conflict resolution, log polling, and git checkpoints to AI
  agents over stdio (plan 020).
```

Remove all conflict markers and the now-obsolete `[0.9.138]` heading.

**Verify**: `grep -n '^## \[0.9.14' CHANGELOG.md` shows `[0.9.140]` as the first
`##` section; `grep -c '<<<<<<<' CHANGELOG.md` → `0`;
`grep -n '0.9.138' CHANGELOG.md` → no matches.

### Step 4: Update the plans index

In `plans/README.md`, change the plan-020 status row (currently claims
`DONE — APPROVED ... (v0.9.138)`) to reflect the real landed state, e.g.:

```
| 020  | MCP server (`@liquidflow/mcp`) — expose sync/conflicts/log/git to AI agents over stdio | P2 | L | — | DONE — merged to `main` (v0.9.140) |
```

Add a row for this plan (021) marked DONE once merged.

**Verify**: `grep -n '020\b' plans/README.md` shows the merged/v0.9.140 status.

### Step 5: Gate and complete the merge

```
npm install     # refresh lockfile against the merged package.jsons
npm test        # MUST be 100% green and collect apps/mcp/src/server.test.js
```

Run the plan-020 Step-3 stdio smoke check once more (a corrupt merge could break
imports). Then complete the merge commit (do not amend the message beyond the
default merge summary) and push per repo convention (`git push origin main`) —
**only if** the operator authorized pushing.

**Verify**: `npm test` exit 0; `git status` clean;
`node apps/mcp/bin/liquidflow-mcp.js` answers an `initialize` request with a
single JSON-RPC line on stdout and nothing else.

## Done criteria

- [ ] `git status` clean; merge commit present on `main`
- [ ] Four `package.json` files all read `0.9.140`; no conflict markers anywhere
      (`grep -rn '<<<<<<<' -- . ':!plans'` → none)
- [ ] `CHANGELOG.md` top section is `[0.9.140]`, no `[0.9.138]` remnant
- [ ] `npm test` exits 0, 100% green, includes `apps/mcp/src/server.test.js`
- [ ] stdio smoke: only JSON-RPC on stdout
- [ ] `plans/README.md` 020 row = merged/v0.9.140; 021 row present

## STOP conditions

- A file other than the four expected ones conflicts during the merge (the
  branch drifted or main moved again) — reassess before resolving.
- `npm test` is not green after the merge — do not "fix" `apps/mcp/**` source
  (it was reviewed and approved); a failure here means the merge or the
  environment is wrong. Report the failing test.
- `npm install` tries to pull `@modelcontextprotocol/server`/`client` (the
  beta split packages) instead of `@modelcontextprotocol/sdk` — the dependency
  was deliberately the unified v1 SDK; do not change it.

## Maintenance notes

- Root cause of this plan: plan 020 was executed in a worktree cut from an older
  commit and its version bump was not rebased before main advanced. Future
  executor dispatches that bump version numbers should rebase onto current
  `main` (or defer the version bump to merge time) to avoid this collision.
- Plan 020's own maintenance notes still apply (deferred git push/pull/clone
  tools, `unlock_template`, HTTP transport, one-session constraint).
