# Implementation Plans

**Run 1** — generated 2026-06-27 (deep audit; scope `packages/core` + `apps/cli`
+ tests; `apps/desktop` excluded). Planned against `e1599ef`. Correctness /
security / tech-debt. Plans 001–004 (all DONE).

**Run 2** — generated 2026-06-28 (`next` / direction audit; same scope, desktop
excluded). Planned against `06c297b`. Roadmap / feature direction. Plans 005–006.

**Run 2b** — 2026-06-29 (`review-plan` of 006). Plan 006 was rebuilt against
`e2e008a` (watcher-pause seam brought into scope, squash+`branch -f` instead of an
impossible fast-forward, `autoPush` redefined, `restore` flagged as the deliberate
watcher exception). `clone` was split out into the new plan **007** (it collides
with the two-mode + external-meta layout and needs its own work).

Each executor: read the plan fully before starting, honor its STOP conditions,
and update your row when done.

Verification gate for every plan: `npm test` must be 100% green (Vitest). There
is no typecheck/lint script — `npm test` is the gate. Repo convention:
Conventional Commits in English, **no `Co-Authored-By` footer**; bump the patch
version in all three `package.json` files and add a `CHANGELOG.md` entry per
commit (see CLAUDE.md).

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001  | Reject server-supplied file names that escape the template dir (path traversal) | P1 | M | — | DONE |
| 002  | Fix the README so it documents the CLI that actually ships | P1 | S | — | DONE |
| 003  | Detach the Controller's global log listeners on dispose() | P2 | S | — | DONE |
| 004  | Regression tests for fixed P1 bugs (git-push failure, interrupted download) | P3 | M | — | DONE |
| 005  | Show a content diff before resolving a conflict (download vs upload) | P1 | M | — | DONE |
| 006  | Git workflow redesign — WIP branch for hot-reload, checkpoint-merge, pull | P1 | L | 005 (DONE) | DONE |
| 007  | Bootstrap a template from a remote git repo (`clone`) | P2 | M | 006 | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale)

**Run 1 (001–004)** — all DONE. Order was by leverage: 001 (security) → 002
(near-free user win) → 003 (tech-debt) → 004 (locks in fixes).

**Run 2 (005–007)** — direction spikes, chosen by the maintainer. All are
design/spike plans: they ship a concrete core deliverable plus a recommended
design, and STOP to confirm product decisions rather than guessing. Order:
**005 (DONE) → 006 → 007**. 005's diff view (already merged) is what makes
resolving 006's pulled-change conflicts safe; 007 (clone) reuses 006's branch
model and `withWatcherPaused`, so it must land after 006.

## Dependency notes

- No hard dependencies between plans.
- **Soft overlap (001 ↔ 004):** both add `it` blocks to
  `packages/core/src/syncEngine.watcher.test.js` and both want
  `import path from 'node:path';` at the top. The additions are distinct (001:
  path-traversal rejection; 004: interrupted-download meta). If executed in the
  same batch, add the import once and keep both tests — no logic conflict.
- **Synergy (005 → 006):** plan 006's `pull`/`checkpoint` surface pulled changes
  as `Timestamp` conflicts; plan 005's diff view (DONE) is what lets the user
  resolve them without blind overwrites.
- **Hard dependency (006 → 007):** plan 007 (`clone`) reuses 006's
  `liquidflow/wip` branch model and `SyncSession.withWatcherPaused`. Do not start
  007 until 006 is DONE.

## Direction findings considered, not (yet) planned

From Run 2 (direction audit). Recorded so they aren't re-surfaced as new each run.

- **DIR-03 — Headless / scriptable CLI mode** (`bin/liquidflow.js` enters Ink
  immediately; no `process.argv` parsing; `Controller` is fully UI-agnostic).
  Real adjacent-possible: subcommands like `liquidflow push/status/pull` would
  unlock CI/automation with no core changes. **Deferred**, not rejected — a
  product bet on whether users want headless. Revisit after 005/006; promote to a
  plan if automation lands on the roadmap.
- **DIR-05 — Concurrent multi-template/multi-shop sync** (`controller.js:31`
  single `state.session`; `_startSession` disposes the prior one). Genuine gap,
  but **honest L**: the controller would become a session *map* and the log layer
  is explicitly built around one active channel. **Deferred** — too big a bet to
  spike before the simpler wins prove out.
- **DIR-04 — Wire up the dead `liquidFileRename` verb** (implemented + translated
  + unit-tested at `soap.js:259`, **zero callers**). **Rejected as a standalone
  plan**: automatic rename-detection from `fs.watch` (separate add/unlink events)
  is fiddly for little gain, and the current delete+add path already works. Fold
  a *manual* rename into a future file-operations UI if one emerges; not worth its
  own effort now.

## Findings considered and rejected (so nobody re-audits them)

- **Shared SOAP client used outside the session queue** (`controller.js:214`,
  `listTemplates` reuses the session's client off-queue). Real but low-risk —
  HTTP requests are independent and `_ensureAuth` at worst double-signs-in. Also
  already logged as an open, deliberately-deferred item in `CODE_REVIEW.md`
  (P2). Not worth a plan now; revisit only if a concurrency bug actually
  surfaces.
- **`SyncSession.command().finally` can resurrect a watcher after `dispose()`**
  (`syncEngine.js:368-369`, no "disposed" guard). Genuine but requires a
  concurrent `dispose()` + in-flight `command()`; the CLI only disposes at
  process exit, so there is no practical trigger. Recorded in plan 003's
  maintenance notes for whoever next touches the session lifecycle.
- **Password encryption is AES-256-CBC without a MAC** (`store.js:55-73`).
  Documented as a conscious decision in `CODE_REVIEW.md` for the "accidental
  file read" threat model. Not a finding under that decision; would only matter
  if the threat model changes.
- **`signInShop` hard-codes the `webmaster` login** (`controller.js:113`). The
  Comarch protocol requires this login; intentional, documented in code.
- **`xml.js` skips whitespace-only text nodes / single-quoted attributes /
  CDATA.** Conscious limitations for the ASMX contract (base64 payloads,
  always-double-quoted attributes); documented in `CODE_REVIEW.md` and code
  comments. Not worth changing.

## What was not audited

`apps/desktop/**` (excluded by request), the manual render-smoke scripts
(`apps/cli/test/*.mjs`, run by hand via `node`, not Vitest), and the exact
wording of `translations.js` strings beyond PL/EN key + token parity (which is
clean — `translations.test.js` passes and the diacritic scan returns zero
untranslated keys).

**Run 2 scope note:** this was a *direction-only* pass — it looked for surface
asymmetries and adjacent-possible features, **not** for new bugs/security/perf
issues (Run 1 covered those for core+CLI). The direction findings are grounded in
code evidence but their *product* value is the maintainer's call; effort
estimates on 005/006 are coarse, as is normal for direction work.
