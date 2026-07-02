# Plan 009: Make `gitClone` reachable — clone-from-remote at connect time

> **Status: stub / design-gate.** Deferred from plan 008 Step 5. This records a
> real flow gap found while verifying 006/007 so it isn't re-discovered later.
> Do **not** execute until the maintainer confirms the product flow (Step 0).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the connect/select flow that every session start goes through)
- **Depends on**: 006, 007, 008 (the branch model, `gitClone`, and the
  serialization fix must all be in `main` first).
- **Category**: direction / bug (dead feature path)
- **Planned at**: commit `c344cbd`, 2026-06-29 (re-baseline + drift-check when picked up)

## Why this matters

`Controller.gitClone(url)` was built in `bfa02e7` (plan 007) but is **effectively
unreachable for its stated purpose**. It requires:
1. `this.state.session` to exist, **and**
2. the mode-`0` dir to have no template files (`GitCloneDirNotEmpty` otherwise).

But obtaining a session goes through `selectTemplate → _startSession →
session.start() → _initialDownload`, and `_initialDownload` populates mode-`0`
from SOAP. So by the time a session exists, condition (2) is already false. The
intended "clone instead of the initial SOAP download" can never happen via the
normal connect → select flow. The CLI even offers **Clone** in the no-repo `/git`
menu, where it will typically fail with `GitCloneDirNotEmpty`.

This is a **product/flow decision**, not a mechanical fix — that's why 008
deliberately deferred it rather than guessing.

## The crux (evidence, from the 008 verification)

- `SyncSession.start()` decides "fresh" by `localFiles.length === 0` (the
  `git.isRepo(templateDir)` half checks the wrong dir — repo is in `…/0/.git`,
  not `…/.git`). After any clone, mode-`0` has files ⇒ not fresh ⇒
  `_initialDownload` skipped ⇒ mode-`2` never downloaded. So clone must run
  **before** `start()` and drive the non-`0` mode download itself (which the
  current `gitClone` already does — it just never gets the chance to run).
- The clean fix is a **connect/select-time branch**: when a template's mode-`0`
  dir is empty and a remote URL is available, run the clone-bootstrap
  (`gitClone`-style: clone mode-`0` + SOAP-download other modes + seed `meta/`)
  **instead of** `_initialDownload`, then start the watcher.

## Step 0 — confirm before building (DESIGN GATE)

1. **Entry point & URL source.** Where does the user supply the remote URL — a
   prompt at connect/select time when mode-`0` is empty, a field in the connect
   form, or a saved per-template remote? Default proposal: offer "Bootstrap from
   remote (git clone)" at select time when the local dir is empty and the user
   has (or enters) a URL.
2. **Overwrite semantics.** Confirm clone is offered only for a genuinely empty
   mode-`0` dir; never over existing files.
3. **Relationship to `_initialDownload`.** Confirm clone-bootstrap *replaces* the
   initial SOAP download for mode-`0` and *supplements* it for other modes (the
   current `gitClone` body already does this).

**STOP and ask** before writing code.

## Likely scope (to be firmed up at execution)

- `packages/core/src/controller.js` — a connect/select-time path that invokes the
  clone-bootstrap before `session.start()` when appropriate; ensure it composes
  with `start()`'s fresh-detection (don't double-download).
- Possibly `packages/core/src/syncEngine.js` — let `start()` accept a "already
  bootstrapped" signal so it skips `_initialDownload` without relying on the
  mode-`0`-empty heuristic.
- `apps/cli/src/commands.js` — surface the bootstrap entry point; the current
  no-repo `/git → Clone` item should route here (or be removed if the connect
  flow owns it).
- Tests: a controller test proving clone-bootstrap runs *before* a session is
  fully started and yields a populated tree (all modes) with seeded meta and no
  false conflicts.

## Out of scope

- The clone primitive (`git.cloneInto`) and the mode-2 + meta-seeding logic —
  already built and tested in 007/008. This plan is **only** the reachability/flow
  wiring.

## Done criteria (draft)

- [ ] A user with an empty local template and a remote URL can bootstrap via the
      app without hitting `GitCloneDirNotEmpty`.
- [ ] After bootstrap, all modes are on disk and matching files are not flagged as
      conflicts (meta seeded).
- [ ] `_initialDownload` does not also run (no double download).
- [ ] `npm test` green; new flow test added.
