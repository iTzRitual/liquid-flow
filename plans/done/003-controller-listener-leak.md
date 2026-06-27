# Plan 003: Detach the Controller's global log listeners on dispose()

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> this plan's status row in `plans/README.md` unless a reviewer told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1599ef..HEAD -- packages/core/src/controller.js`
> If `controller.js` changed since this plan was written, compare the
> "Current state" excerpts against the live code; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e1599ef`, 2026-06-27

## Why this matters

`Controller` subscribes to the **module-global** `logbuf.events` emitter in its
constructor, using anonymous arrow functions — which means the subscriptions can
never be removed. `dispose()` does not remove them. This contradicts the
contract stated in `CLAUDE.md` ("Controllery twórz per-test i `dispose()` …
odpinają globalne nasłuchy `logbuf`"). Consequences:

- A disposed `Controller` keeps re-emitting `'log'` / `'log:reset'` events
  forever (a leak: the instance can't be garbage-collected while the global
  emitter holds the closure).
- Every `Controller` ever constructed adds two listeners to a single emitter
  capped at 50 (`log.js:40`, `events.setMaxListeners(50)`). Hosts that create
  controllers repeatedly — the test suite today, and any future multi-window or
  multi-session host — accumulate listeners and eventually hit the cap, with
  cross-talk between supposedly-dead controllers in between.

The CLI happens to dodge real-world impact because it builds exactly one
controller for the process lifetime — but the documented contract is false and
the test isolation it promises doesn't hold. This is a small, contained fix.

## Current state

File: `packages/core/src/controller.js`.

Constructor — anonymous, unremovable listeners (`controller.js:33-38`):

```js
    // przekazuj log do nasłuchujących (renderer): 'log' = nowy wpis,
    // 'log:reset' = pełna podmiana bufora po przełączeniu kanału (zmiana
    // sklepu/szablonu — każdy ma osobny strumień logów).
    logbuf.events.on('entry', (e) => this.emit('log', e));
    logbuf.events.on('reset', (entries) => this.emit('log:reset', entries));
```

`dispose()` — removes nothing from `logbuf.events` (`controller.js:454-457`):

```js
  dispose() {
    if (this.state.session) this.state.session.dispose();
    if (this._commitTimer) clearTimeout(this._commitTimer);
  }
```

`logbuf` is imported as `import * as logbuf from './log.js';`
(`controller.js:8`), and `log.js` exports an `events` EventEmitter
(`log.js:39`) that supports the standard `.on` / `.off` / `.listenerCount`.

**Conventions:** ESM, Polish comments. Tests live beside sources as
`*.test.js`. `controller.test.js` already imports `Controller` and
`* as logbuf` and runs `beforeEach`/`afterEach` (see lines 1-23).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused tests | `npx vitest run packages/core/src/controller.test.js packages/core/src/controller.session.test.js` | all pass |
| Full suite | `npm test` | exit 0, all pass |

(No typecheck/lint script in this repo; `npm test` is the gate.)

## Scope

**In scope** (the only files you should modify):

- `packages/core/src/controller.js`
- `packages/core/src/controller.test.js` (add one test)

**Out of scope** (do NOT touch):

- `packages/core/src/log.js` — the emitter and `setMaxListeners(50)` are fine;
  the bug is on the Controller side. Do not change the cap to mask the leak.
- The CLI's `useController.js` — it already calls `ctrl.dispose()` on unmount;
  once dispose detaches the listeners, no CLI change is needed.

## Git workflow

- Branch: `advisor/003-controller-listener-leak`
- Conventional Commits in English, e.g.
  `fix(core): detach global log listeners in Controller.dispose`.
- **No `Co-Authored-By` footer** (repo convention in `CLAUDE.md`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Store named listener references in the constructor

In `packages/core/src/controller.js`, replace the two anonymous
`logbuf.events.on(...)` calls (lines 36-37) with named handlers held on the
instance:

```js
    // Trzymamy referencje do handlerów, żeby dispose() mógł je odpiąć od
    // GLOBALNEGO emitera logbuf.events (inaczej każdy Controller zostawia
    // nasłuchy na zawsze — wyciek + przekroczenie limitu listenerów).
    this._onLogEntry = (e) => this.emit('log', e);
    this._onLogReset = (entries) => this.emit('log:reset', entries);
    logbuf.events.on('entry', this._onLogEntry);
    logbuf.events.on('reset', this._onLogReset);
```

### Step 2: Detach them in dispose()

Replace `dispose()` (lines 454-457) with:

```js
  dispose() {
    if (this.state.session) this.state.session.dispose();
    if (this._commitTimer) clearTimeout(this._commitTimer);
    logbuf.events.off('entry', this._onLogEntry);
    logbuf.events.off('reset', this._onLogReset);
  }
```

**Verify**: `npx vitest run packages/core/src/controller.test.js packages/core/src/controller.session.test.js`
→ all existing tests still pass.

### Step 3: Add a regression test

In `packages/core/src/controller.test.js`, add this test (a top-level
`describe`, anywhere after the existing imports/hooks — it uses its **own**
local controller `c`, not the shared `ctrl`, so the `afterEach` doesn't
double-dispose it):

```js
describe('Controller — cykl życia nasłuchów logbuf', () => {
  it('dispose() odpina globalne nasłuchy entry/reset (brak wycieku)', () => {
    const beforeEntry = logbuf.events.listenerCount('entry');
    const beforeReset = logbuf.events.listenerCount('reset');

    const c = new Controller();
    expect(logbuf.events.listenerCount('entry')).toBe(beforeEntry + 1);
    expect(logbuf.events.listenerCount('reset')).toBe(beforeReset + 1);

    c.dispose();
    expect(logbuf.events.listenerCount('entry')).toBe(beforeEntry);
    expect(logbuf.events.listenerCount('reset')).toBe(beforeReset);
  });
});
```

**Verify**: `npx vitest run packages/core/src/controller.test.js` → all pass,
including the new test.

### Step 4: Full suite + commit

**Verify**: `npm test` → exit 0, all test files pass. Then commit per the Git
workflow section.

## Test plan

- New test in `controller.test.js`: constructing a `Controller` adds exactly one
  `entry` and one `reset` listener to `logbuf.events`; `dispose()` removes both,
  returning the counts to baseline. This is the direct regression guard for the
  leak.
- Existing `controller.test.js` / `controller.session.test.js` confirm log
  forwarding still works end-to-end (their assertions on emitted `log`/state
  events would fail if the listeners weren't attached).
- Verification: `npm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "_onLogEntry\|_onLogReset" packages/core/src/controller.js` shows the handlers defined in the constructor and removed in `dispose()` (4 matches: 2 assign, 2 `.off`, plus the 2 `.on`).
- [ ] `grep -n "logbuf.events.off" packages/core/src/controller.js` shows two `.off` calls in `dispose()`.
- [ ] `npm test` exits 0; the new "brak wycieku" test exists and passes.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The constructor or `dispose()` no longer matches the "Current state" excerpts
  (controller.js drifted).
- Removing the listeners breaks an existing controller test — that would mean
  something relies on a disposed controller still forwarding logs, which is the
  bug, not a feature: stop and report what relied on it.
- `logbuf.events` no longer exposes `.off` / `.listenerCount` (the log module
  changed shape).

## Maintenance notes

- Any future subscription a `Controller` makes to a **module-global** emitter
  must be torn down in `dispose()` the same way — store a named reference, then
  `.off` it. Anonymous inline listeners on a shared emitter are the trap this
  plan fixes.
- Related, deliberately **out of scope** here (flag for a follow-up if it
  recurs): `SyncSession.command()`'s `finally` calls `_startWatcher()` with no
  "disposed" guard, so a `dispose()` racing an in-flight command can resurrect
  an `fs.watch`. Not addressed here because it needs concurrent dispose+command
  (the CLI disposes only at process exit). Mentioned so a reviewer touching the
  session lifecycle is aware.
