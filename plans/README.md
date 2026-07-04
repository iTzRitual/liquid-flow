# Implementation Plans

Active plans only. Completed work (plans 001–021) has been cleared; the
authoritative record of what shipped lives in `CHANGELOG.md` and the git
history.

Each executor: read the plan fully before starting, honor its STOP conditions,
and update your row when done.

Verification gate for every plan: `npm test` must be 100% green (Vitest). There
is no typecheck/lint script — `npm test` is the gate. Repo convention:
Conventional Commits in English, **no `Co-Authored-By` footer**; bump the patch
version in all four `package.json` files (root, `apps/cli`, `packages/core`,
`apps/mcp`) and add a `CHANGELOG.md` entry per commit (see CLAUDE.md).

## Execution order & status

| Plan | Title                                                                                                                | Priority | Effort | Depends on | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ------ |
| 022  | Shared daemon foundation — one Controller, many thin clients (daemon + `DaemonClient` + `connectController` in core) | P1       | L      | —          | DONE   |
| 023  | Migrate the CLI onto the shared daemon (`connectController`)                                                         | P1       | M      | 022        | DONE   |
| 024  | Migrate the MCP server onto the shared daemon                                                                        | P1       | M      | 022        | DONE   |
| 025  | Migrate the desktop app onto the shared daemon                                                                       | P2       | M      | 022        | DONE   |
| 027  | Post-migration bookkeeping — CLI changelog entry, lockfile check, parallel-worktree hygiene note                     | P3       | S      | 022–025    | DONE   |
| 028  | Unify data home across apps — desktop pins core `defaultAppDir()` so all apps share one daemon (fixes split shops)   | P1       | S      | 022–025    | DONE   |
| 029  | Leak-proof daemon lifecycle — daemon exits when no clients remain (no orphaned processes, clean start)               | P1       | M      | 022, 028   | DONE   |
| 030  | Share shop configuration between machines — in-app export/import of selected shops (CLI + desktop, passphrase-protected, MCP excluded) | P2 | L | — | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale)

## Run 7 (030) — share shop configuration within a team

Generated 2026-07-04 (`plan` from a maintainer feature request: "share my shops
with a teammate — I've added 15, let them import conveniently, in-app not by
dropping files in a folder; export/import both start with all shops checked but I
can uncheck to pick a subset; CLI + desktop, **not** MCP since it gets no password
access"). Planned against `b49b1d6` (v0.9.147).

Core constraint driving the design: shop passwords in `config.json` are encrypted
with a **machine-local random key** (`store.js` `.key`), so a raw copy is useless
elsewhere. The export decrypts locally and re-protects the bundle under an
**optional user passphrase** (PBKDF2 + AES-256-GCM; blank passphrase = no
passwords in the file); import re-encrypts each password under the importer's own
local key. Decisions baked into the plan: passphrase optional, share connection +
template-unlock passwords (never local files/git/meta), and name collisions
warn + let the user choose Skip/Update/Rename per shop. Crypto/config work runs in
the shared daemon (the process that owns the local key); file dialogs stay
Electron-local; CLI does its own file I/O. Single plan, phased core → RPC → CLI →
desktop → i18n so each phase is an independently-verifiable commit.

## Run 6 (022–025) — unify the three apps over one shared daemon

Generated 2026-07-02 (`plan` from a maintainer feature request: "connect all
three apps — shared live logs, one folder, no multiplied processes/watchers,
save shop/password once and see it everywhere, watch in the CLI while driving
through MCP"). Planned against `79f68de` (v0.9.140).

Root cause of every symptom: each app builds its own in-process `Controller`
(`apps/cli/src/useController.js:13`, `apps/desktop/electron/main.js:24`,
`apps/mcp/bin/liquidflow-mcp.js:8`), `log.js`'s event bus is a per-process
singleton, and `config.json` is read once at construction — so nothing is live
across processes and two apps on one template = two watchers racing. Fix is a
**single shared daemon** owning one `Controller`, with all three apps attached
as thin clients. Split into a foundation plan + three app migrations so each is
one clean, independently-reviewable diff:

- **022 (foundation, P1, L)** — new `liquidflow-daemon` process + `DaemonClient`
    - `connectController()` factory in `@liquidflow/core`, over a local
      unix-socket/named-pipe. Purely additive; migrates **no** app, so it can't
      regress anything. Auto-spawns the daemon on first use; `LIQUID_FLOW_NO_DAEMON=1`
      keeps today's in-process behavior. This is the whole hard part (RPC surface,
      event broadcast, snapshot-on-connect, lifecycle, tests).
- **023 (CLI, P1, M)**, **024 (MCP, P1, M)**, **025 (desktop, P2, M)** — each
  swaps `new Controller()` → `await connectController()`. 023 and 024 are the
  pair the user explicitly wants sharing (watch in CLI, drive via MCP), so they
  come first; 025 completes the trio and is kept minimal/additive (desktop UI is
  a draft — renderer untouched).

Recommended order: **022 → (024, 023 in either order) → 025**. The daemon's RPC
method map deliberately reuses the exact method strings the desktop IPC bridge
already uses (`main.js:90-145`), which is why the desktop migration is the
smallest of the three.

## Dependency notes

- **022 blocks 023, 024, 025** (hard): all three import `connectController` /
  `DaemonClient` from `@liquidflow/core`, which 022 creates. Do not dispatch a
  migration until 022 is DONE and merged.
- **023/024/025 are mutually independent** — no ordering between them; parallel
  dispatch is fine. Version-bump collisions across parallel worktrees are the
  known trap — rebase onto current `main` before merge, or defer the version
  bump to merge time.
