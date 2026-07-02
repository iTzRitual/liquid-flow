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

**Run 2c** — 2026-06-29 (verification of the 006/007 implementation in commit
`bfa02e7`). The git layer + CLI match the plans, but `npm test` is **red** (1/267:
a `.git/index.lock` race in the auto-commit path, which runs git mutations outside
the session serialization queue) and two minor bugs surfaced (wrong wip branch-base;
a network-dependent clone test). Plan **008** remediates these; 006/007 are back to
IN PROGRESS until 008 greens the suite.

**Run 2d** — 2026-06-29 (`execute` of 008). Executed by a sonnet subagent in an
isolated worktree (one run was interrupted by a machine crash; a second sonnet
executor resumed the preserved partial work). Reviewer (advisor) verdict: **APPROVE**
— gate re-run twice independently (281/281 green both), scope clean, serialization
routing correct (`runExclusive` for auto-commit/restore/init, `withWatcherPaused`
for tree-mutating ops; restore stays watcher-live), new tests assert real behavior,
i18n parity clean. The fix lives in worktree branch
`worktree-agent-a10897c65416d1431` @ `4a2d437` — **not yet merged to `main`**
(merging is the maintainer's decision). The deferred clone-reachability item (008
Step 5) is recorded as plan **009**.

**Run 3** — generated 2026-06-29 (focus: **desktop ↔ CLI parity**; scope
`apps/desktop` + the IPC bridge + read-only core surface). Planned against
`49dbf68`. The desktop was not updated while the CLI gained the git-redesign
(006/008), the conflict diff preview (005), and structured logs — so the desktop
under-uses the shared core and, in one case, is actively misleading (see 011).
Plans **011–014**. Per the maintainer's constraint, the desktop UI is a draft to
be redesigned later, so every plan is **minimal and additive** (IPC bridge wiring
+ small affordances on existing shadcn components — no UI redesign). **No new
i18n keys are needed** — the entire git-workflow + diff key set already exists in
both `pl` and `en` from the CLI work.

**Run 3b** — 2026-07-01 (`execute` of 013 + 014, with review of the already-merged
012). Reviewing the merged desktop-parity work surfaced a **P0 regression on `main`**:
plans 011 and 012 each added a `fmt` helper to `apps/desktop/renderer/src/lib/utils.js`
"idempotently" — but in separate worktrees, so the two merges collided into a
**duplicate `export function fmt`** (redeclaration → `vite build` fails). Plan **015**
(fix) removes the duplicate; DONE + merged (`8f18d97`, v0.9.124). Then 013 + 014 were
dispatched as parallel sonnet executors off the fixed HEAD.

**Run 4** — 2026-07-01 (`plan` from a field report; scope: the **CLI conflict diff
preview** — `apps/cli` + read-only `packages/core`). Three user-reported issues in
`/conflicts` → "Podgląd", all confirmed in code. Planned against `66595db`. Plans
**016–018**:
- **016** (P1) — Timestamp conflicts are content-blind, so syncing a template from a
  second machine flags every file even when the bytes are identical; the preview then
  says "Brak różnic", reading like a bug. Make that state explicit ("identical content
  — only the timestamp differs") + add a byte-free, guarded **Reconcile** action.
- **017** (P2) — folded unchanged lines ("⋯ N niezmienionych wierszy") are not
  revealable; add a **Tab** expand/collapse toggle (needs a no-fold mode in
  `buildDiffRows`).
- **018** (P1) — the `tooLarge`/`binary` preview renders **corrupted** (untruncated
  title wraps + a 1-row overlay under-allocation → Ink frame duplication). Two-line fix.

Recommended order by leverage: **018** (cheapest, visible corruption) → **016**
(headline user confusion + safe resolution) → **017** (enhancement). All three are
CLI-only; each carries a **deferred desktop-parity follow-up** note (the desktop
preview from plan 012 shares the same core and would benefit — small additive work,
consistent with the "desktop is a draft" constraint).

**Run 4b** — 2026-07-01 (maintainer feedback on the merged 016/017, implemented
directly on `main`, commit `7b3ad9f`, v0.9.131). Two design corrections:
- **016's Reconcile button was wrong UX.** The maintainer's point: an identical-content
  file should never be a conflict in the first place, and a per-row "Reconcile" action
  is noise. Fix: `SyncSession.refreshMismatches` now **auto-suppresses** byte-identical
  `Timestamp` conflicts — it fetches the body for each Timestamp candidate (MetaGet has
  no size/hash, so a body fetch is required), and if the normalized content is identical
  it re-stamps the meta baseline (no transfer) and drops the conflict. A per-file cache
  keyed on the `fileTs|remoteTs` signature stops genuinely-different files from being
  re-fetched every `POLL_MS`. The `reconcile` command/button and the `DiffIdentical`
  message were removed.
- **017's Tab-expand didn't grow the window.** The overlay was sized to the *folded*
  line count, so expanding an all-context or small-change diff crammed the content into
  a 1-row viewport ("↓ N więcej", unreadable). Fix: the expand state was lifted from
  `DiffView` into the parent `mode` (App.jsx), and `naturalBodyRows('diff')` now uses
  `mode.expanded ? fullLines : lines` — so Tab genuinely resizes the overlay to a
  full-height, scrollable view.
Recorded as plan **019** (supersedes 016). Cost note: entering `/conflicts` with many
real conflicts now fetches each candidate's body once (cached thereafter); acceptable
for typical conflict counts, revisit if a content hash lands in the SOAP metadata.

**Run 5** — 2026-07-02 (`plan` from a maintainer request: "add an MCP server so
other AI agents can use this app"; scope: a **new workspace `apps/mcp`** over the
read-only core surface). Planned against `2a0d9d2` (v0.9.137). Plan **020**: a
stdio MCP server (`@liquidflow/mcp`, bin `liquidflow-mcp`) as a third "skin"
over `Controller` — 14 tools covering connect/templates/sync-session, live
conflict listing + resolution + diff preview, incremental log polling, git
status/history/checkpoint, and a `get_workspace_info` tool that hands agents
the hot-reload edit folder. Design decisions locked in the plan: saved-password
shops only (no credentials over MCP), English tool descriptions as a documented
i18n exception (like `git.js`), JSON-in-text results, git push/pull/clone and
HTTP transport deferred. SDK facts (split `@modelcontextprotocol/server` /
`client` packages, zod v4, `InMemoryTransport` test pattern) were verified
against the official docs on 2026-07-02, with a pinned v1-SDK fallback as an
escape hatch. This realizes the deferred direction finding **DIR-03**
(headless/scriptable surface) via MCP rather than shell subcommands.

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
| 006  | Git workflow redesign — WIP branch for hot-reload, checkpoint-merge, pull | P1 | L | 005 (DONE) | DONE (impl `bfa02e7`; race fixed by 008 — pending merge) |
| 007  | Bootstrap a template from a remote git repo (`clone`) | P2 | M | 006 | DONE (impl `bfa02e7`; fixed by 008; clone reachability → 009) |
| 008  | Fix git-serialization race (red suite) + branch-base bug + network test | P0 | M | 006, 007 | DONE — APPROVED, merged to `main` @ `4a2d437` (v0.9.116) |
| 009  | Clone-bootstrap flow — make `gitClone` reachable at connect time | P2 | M | 006, 007, 008 | TODO (deferred from 008 Step 5) |
| 010  | Fix multi-line log entries corrupting the TUI + graceful "no remote" guard | P1 | S–M | 008 | DONE — APPROVED, on `main` @ `2419c46` (v0.9.117), 287/287 green |
| 011  | Desktop git checkpoint workflow + fix misleading Push/Auto-push | P1 | M | — | DONE — APPROVED, worktree `worktree-agent-ac142fbb1cc947dda` (v0.9.122); manual smoke pending merge |
| 012  | Desktop conflict diff preview (before download/upload) | P2 | M | — | DONE — APPROVED, merged to `main` @ `31a13b9` (v0.9.123); manual smoke pending |
| 013  | Desktop git collaboration — pull + branch switch/create | P2 | L | (soft) 011 | DONE — APPROVED, merged to `main` @ `66f30ba` (v0.9.125); manual smoke pending |
| 014  | Desktop sync-start progress loader + log history/separator styling | P3 | S | — | DONE — APPROVED, merged to `main` @ `e28c8c2` (v0.9.126); manual smoke pending |
| 015  | Fix duplicate `fmt` export breaking the renderer build (011+012 merge collision) | P0 | XS | — | DONE — APPROVED, merged to `main` @ `8f18d97` (v0.9.124) |
| 016  | Flag byte-identical timestamp conflicts + add a byte-free `reconcile` action (CLI) | P1 | M | — | SUPERSEDED — merged to `main` @ `a1146ef` (v0.9.129), then reworked per maintainer feedback: the `reconcile` button was UX-wrong (identical files shouldn't be conflicts at all). Replaced by auto-suppress in `7b3ad9f` (v0.9.131) — see Run 4b. |
| 017  | Expand folded unchanged lines in the conflict diff preview (Tab toggle, CLI) | P2 | M | — | DONE (revised) — merged to `main` @ `eba0596` (v0.9.130); Tab-expand fixed in `7b3ad9f` (v0.9.131) to actually grow the overlay (was cramming expanded content into a 1-row viewport). |
| 018  | Fix corrupted `tooLarge`/`binary` diff-preview render (title truncate + overlay sizing, CLI) | P1 | S | — | DONE — merged to `main` @ `926649c` (v0.9.128). |
| 019  | Auto-suppress identical-content timestamp conflicts + Tab-expand grows the diff window (CLI) | P1 | M | supersedes 016 | DONE — implemented directly on `main` @ `7b3ad9f` (v0.9.131), pushed. |
| 020  | MCP server (`@liquidflow/mcp`) — expose sync/conflicts/log/git to AI agents over stdio | P2 | L | — | TODO |

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
- **Remediation (008 over 006/007):** 006/007 were implemented in `bfa02e7` but
  left the suite red (auto-commit git mutations run outside the session queue →
  `.git/index.lock` race). Plan **008** is P0 — it must land before 006/007 can be
  called DONE. It also fixes the wip branch-base bug and decides clone reachability.

### Run 3 (desktop parity, 011–014)

- **No hard dependencies; all four are independently shippable.** Each adds its
  own IPC-bridge lines and a `fmt()` helper to `apps/desktop/renderer/src/lib/utils.js`
  **idempotently** (each plan says "add if not present, skip if present").
- **Shared-file overlap (011/012/013):** all three append to
  `apps/desktop/electron/main.js` (the `handlers` map) and
  `apps/desktop/electron/preload.cjs` (the `window.api` object). Additions are
  **distinct keys**, so they don't conflict; if executed in the same batch, just
  don't duplicate the `git.uncommittedCount` handler (011 and 013 both want it —
  keep one).
- **Soft order 011 → 013:** both touch `GitPanel.jsx` and both want
  `git.uncommittedCount`. Landing 011 first means 013's "ahead/discard" wiring is
  already present. Not a hard block.
- **Recommended order by leverage:** **011** (fixes the actively-broken Push) →
  **012** (prevents blind overwrites) → **014** (cheap polish, low risk) →
  **013** (largest, least central). 014 is a good warm-up — renderer-only, no bridge.
- **Verification reality for all desktop plans:** `apps/desktop/**` is **outside
  Vitest** (`vitest.config.js` includes only `packages/core` + `apps/cli`). The gate
  is therefore (1) `npm run build:renderer --workspace @liquidflow/desktop` (compile),
  (2) `npm test` green as a core/CLI **regression guard**, and (3) a **manual smoke
  checklist** in each plan via `npm run dev`. There is no unit test for the bridge.
- **Clone deferred:** desktop git **clone** is intentionally NOT in 013 — it needs
  an empty mode-0 dir, but template selection auto-downloads mode-0, so it is
  unreachable in the normal flow (same gap as plan **009**, TODO). Add it as a
  follow-up once 009 defines a pre-download bootstrap entry point.

### Run 4 (CLI diff-preview fixes, 016–018)

- **No hard dependencies.** All three are independently shippable; recommended
  order is by leverage: **018 → 016 → 017**.
- **Shared-file overlap (016 ↔ 017):** both edit
  `apps/cli/src/components/DiffView.jsx` — 016 changes the `summary` computation
  (~line 126), 017 adds an `expanded` state + Tab handler + footer hint (different
  regions). If executed in the same batch, apply both; they don't conflict. Both
  also add keys to `packages/core/src/translations.js` — keep both key sets.
- **Synergy (016 + 017):** 016 makes the identical-content case *legible*; 017's
  Tab-expand lets the user actually read the 163 unchanged lines behind the fold in
  that same case. Landing both gives the fullest answer to the field report.
- **Scope guard:** 016's Reconcile action is a data-only option in `commands.js`;
  none of the three plans may edit `ConflictList.jsx` (fragile render) or
  `refreshMismatches` (auto-suppress was rejected as too costly — see below).

## Direction findings considered, not (yet) planned

From Run 2 (direction audit). Recorded so they aren't re-surfaced as new each run.

- **DIR-03 — Headless / scriptable CLI mode** (`bin/liquidflow.js` enters Ink
  immediately; no `process.argv` parsing; `Controller` is fully UI-agnostic).
  Real adjacent-possible: subcommands like `liquidflow push/status/pull` would
  unlock CI/automation with no core changes. ~~Deferred~~ **Promoted (Run 5)**:
  the maintainer chose the MCP-server shape of this finding — plan **020**
  exposes the same headless surface to AI agents over stdio. Shell subcommands
  remain unbuilt; revisit only if human-driven CI automation is requested.
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

## Desktop-parity findings considered and rejected (Run 3)

- **`setUiPref` (logWrap / headerMode) not bridged to desktop.** Rejected — these
  are terminal-only concepts (log line-wrapping; ASCII-header degradation by
  terminal height). They have no meaning in the Electron UI. Not a gap.
- **`recheckMismatches` (live conflict recompute on open) not bridged.** Rejected
  as a standalone item — the desktop already gets fresh conflicts from the
  background poll + push events, so an explicit recheck adds little. Fold into a
  future conflicts-screen refresh if one is built; not worth its own plan.
- **Conflicts panel shows a third timestamp (`LocalTs`, the meta baseline) the CLI
  dropped as "technical."** Rejected — cosmetic; the field still exists on the
  mismatch object (`syncEngine.js:307,325`), so nothing is broken. Tidy it during
  the eventual UI redesign, not now.

### Run 4 (CLI diff-preview)

- **Auto-suppress byte-identical timestamp conflicts during the poll.** ~~Rejected~~
  **REVERSED and implemented** (plan 019, Run 4b). Originally rejected as too heavy
  (a body fetch per file per `POLL_MS` tick), but the maintainer was right that
  identical files shouldn't be conflicts at all. The cost was bounded to an acceptable
  level: fetch bodies **only for Timestamp candidates** (not every file), and cache the
  `fileTs|remoteTs` signature of confirmed-different files so real diffs aren't
  re-fetched each poll. Identical ones self-heal (re-stamped → no longer candidates).
- **Resize the `tooLarge` overlay by editing `layout.js`.** Rejected — the formula
  `naturalBodyRows('diff') = lines + 4` is correct; the bug is the *input*
  (`lines = 0` for non-text previews in `commands.js`). Plan 018 fixes the input, not
  the formula.

## What was not audited

Run 3 audited only the **desktop ↔ CLI feature-parity surface** (which core methods
/ events the CLI consumes that the desktop does not, and where the core changed
under the desktop). It was **not** a full security / performance / correctness /
test audit of `apps/desktop/**` — that remains unaudited. Earlier runs:
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
