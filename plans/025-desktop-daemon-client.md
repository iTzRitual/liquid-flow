# Plan 025: Migrate the desktop app onto the shared daemon

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done (unless a
> reviewer maintains the index).
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA of 022 merge>..HEAD -- apps/desktop/electron/main.js apps/desktop/electron/preload.cjs`
> Compare "Current state" excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P2 (after CLI + MCP — those are the pair the user explicitly
  wants sharing; desktop completes the trio)
- **Effort**: M
- **Risk**: MED (Electron main process; keep the change **minimal and additive**
  per the standing "desktop UI is a draft" constraint — see `plans/README.md`
  Run 3 and the memory note)
- **Depends on**: plan 022 (DONE). Independent of 023/024.
- **Category**: architecture / migration
- **Planned at**: fill with `git rev-parse --short HEAD` when 022 is merged.

## Why this matters

The desktop app is the third `new Controller()` (`apps/desktop/electron/main.js:24`).
Migrating it to `connectController()` completes the user's goal: open the CLI and
the desktop and they show the **same** live logs and state; a shop/password
saved in the desktop appears in the CLI instantly (and vice versa); there is one
watcher, one sync session, one source of truth. The desktop's renderer and IPC
bridge are **unchanged** — only how `main.js` obtains its `controller` changes,
so this is a low-surface swap that respects the "desktop is a draft" rule.

## Current state

- **`apps/desktop/electron/main.js`**:
  - Line 12: `process.env.LIQUID_FLOW_HOME = process.env.LIQUID_FLOW_HOME || app.getPath('userData');`
    — **critical**: the desktop pins the data dir to Electron's `userData`.
    Because `store.daemonSocketPath()` derives from `LIQUID_FLOW_HOME`, the
    spawned daemon **must inherit this same `LIQUID_FLOW_HOME`** or it will use a
    different data dir and socket than the CLI. `spawnDaemon` (plan 022) passes
    `process.env` through, and this line sets the env **before** the controller
    is created — so as long as the swap keeps that ordering, the daemon inherits
    the right home. Verify this in Step 3.
  - Lines 21-35: `getController()` — `new Controller(...)` then subscribes to
    `['log','log:reset','mismatches','state','git','progress']` and forwards each
    to the renderer via `mainWindow.webContents.send('event', {type, payload})`.
  - Lines 90-145: `registerIpc(ctrl)` maps method strings → `ctrl.*`. **The
    controller-logic methods use the exact strings in the daemon's method map**
    (plan 022 `buildMethods`). The `sys.openFolder/openShop/openExternal`
    handlers use Electron `shell` and **must stay local** (the daemon can't open
    a window).
  - Line 180: `app.on('before-quit', () => { if (controller) controller.dispose(); })`.
- **`DaemonClient` (plan 022)**: same event names; sync `getState()`,
  `getMismatches()`, `getLog(0)`; async method wrappers for everything else
  including `currentFolder()`/`currentShopUrl()` (used by the `sys.*` shell
  handlers). `dispose()` only disconnects.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | exit 0, green |
| Renderer build (compile check) | `npm run build --workspace @liquidflow/desktop` | exit 0, bundles |
| Dev run (manual) | `npm run dev` | app launches, connects |

## Scope

**In scope**:
- `apps/desktop/electron/main.js` (edit) — `getController()` uses
  `await connectController()`; keep the event-forwarding and IPC bridge intact;
  `await` the now-async `currentFolder()`/`currentShopUrl()` inside the two
  `sys.*` shell handlers that use them.
- Four `package.json` version bumps + `CHANGELOG.md`.

**Out of scope** (hard — desktop is a draft):
- `apps/desktop/renderer/**` — **no renderer/UI changes**. The renderer already
  talks only through `window.api` IPC; it must not notice the daemon.
- `apps/desktop/electron/preload.cjs` — the bridge is unchanged.
- `packages/core/**`, `apps/cli/**`, `apps/mcp/**`.
- The IPC method-string surface — keep every existing `invoke` method working.

## Git workflow

- Branch: `advisor/025-desktop-daemon-client`.
- Conventional Commits, English, no `Co-Authored-By`. Example:
  `refactor(desktop): attach main process to shared daemon via connectController`.
- Bump all four `package.json` + `CHANGELOG.md`.

## Steps

### Step 1: Make `getController()` attach to the daemon

`getController()` is already `async`. Replace the construction:

```js
async function getController() {
  if (!controller) {
    const { connectController } = await import('@liquidflow/core');
    controller = await connectController({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
    for (const type of ['log', 'log:reset', 'mismatches', 'state', 'git', 'progress']) {
      controller.on(type, (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('event', { type, payload });
        }
      });
    }
  }
  return controller;
}
```

The event forwarding is byte-for-byte the same — `DaemonClient` emits the same
event names, and the `snapshot` on connect fires `state`/`log:reset`/`mismatches`
so the renderer primes exactly as before.

**Verify**: `grep -n "new Controller" apps/desktop/electron/main.js` → none.

### Step 2: `await` async accessors in the `sys.*` shell handlers

In `registerIpc`, the shell handlers read controller paths synchronously:
- `'sys.openFolder': () => { const d = ctrl.currentFolder(); ... }`
- `'sys.openShop': () => { const u = ctrl.currentShopUrl(); ... }`

`currentFolder()`/`currentShopUrl()` are async on the client. Make these
handlers `async` and `await` the value:

```js
'sys.openFolder': async () => { const d = await ctrl.currentFolder(); if (d) shell.openPath(d); return d; },
'sys.openShop':   async () => { const u = await ctrl.currentShopUrl(); if (u) shell.openExternal(u); return u; },
```

`sys.openExternal` takes its URL as an argument — leave it unchanged. All other
handlers already `return fn(arg)` through the `ipcMain.handle('invoke', ...)`
wrapper which `await`s the result, so making these async is transparent.

**Verify**: `grep -n "ctrl.currentFolder()\|ctrl.currentShopUrl()" apps/desktop/electron/main.js`
→ both are `await`ed.

### Step 3: Confirm `LIQUID_FLOW_HOME` propagation ordering

Ensure line 12 (`process.env.LIQUID_FLOW_HOME = ... app.getPath('userData')`)
still runs **before** `getController()` is called in `app.whenReady()`. It does
today (line 12 is module top-level, `getController` is called in the
`whenReady` handler at line 163). Do not move it. This guarantees the spawned
daemon inherits the desktop's data dir and thus the **same socket** as the CLI.

**Verify**: read `main.js` and confirm line 12 precedes the `whenReady` block;
manual dev run (Step 4) with the same `LIQUID_FLOW_HOME` as a running CLI shows
shared state.

### Step 4: Version bump + CHANGELOG + gate

Bump all four `package.json`; add a `CHANGELOG.md` `### Changed` entry ("Desktop
app attaches to the shared daemon; logs/state/shops are shared live with the CLI
and MCP"). Run the gate and a renderer build (the desktop has no unit tests, so
the build + manual smoke are the checks).

**Verify**: `npm test` exit 0; `npm run build --workspace @liquidflow/desktop`
exit 0.

## Test plan

- No automated desktop tests exist (per CLAUDE.md, desktop e2e via Playwright is
  a deferred Phase-3 track). Gates here are: `npm test` still green (core/CLI/MCP
  unaffected), the renderer **builds**, and a **manual** dev run.
- Manual acceptance (record in NOTES):
  1. `npm run dev`; app connects, shows state/log.
  2. With the same `LIQUID_FLOW_HOME`, open the CLL (`npm run cli`) → both show
     the same shops; connect a shop in one → the other updates live.
  3. Select a template in the desktop, edit a file → hot-reload logs appear in
     **both** desktop and CLI; only **one** watcher exists (no double uploads).
  4. Quit the desktop → the daemon keeps running if the CLI is still attached.

## Done criteria

- [ ] `grep -n "new Controller" apps/desktop/electron/main.js` → none.
- [ ] `npm test` exit 0, green.
- [ ] `npm run build --workspace @liquidflow/desktop` exit 0.
- [ ] Manual: desktop and CLI on the same `LIQUID_FLOW_HOME` share live
      state/logs; quitting one leaves the other's daemon session intact.
- [ ] No files under `apps/desktop/renderer/` or `preload.cjs` changed.
- [ ] Four `package.json` bumped; `CHANGELOG.md` updated.
- [ ] `plans/README.md` row updated.

## STOP conditions

- `connectController` not exported from `@liquidflow/core` → 022 not merged; STOP.
- The renderer stops receiving events after the swap → the event-forwarding
  wiring was altered; restore it exactly (same six event names, same
  `webContents.send('event', {type, payload})`).
- The daemon spawned by the desktop uses a **different** socket/data dir than the
  CLI (shared state doesn't work) → the `LIQUID_FLOW_HOME` ordering broke;
  re-check Step 3.
- Any renderer/UI file needs changing to make this work → out of scope; report.

## Maintenance notes

- Electron packaging: the daemon bin lives in `@liquidflow/core`
  (`bin/liquidflow-daemon.js`). Confirm the packaged app can resolve
  `process.execPath` + that bin path inside an asar bundle — if
  `connectController`'s `spawnDaemon` can't find the bin when packaged, a
  follow-up may need to unpack the daemon bin (`asarUnpack`) or point
  `spawnDaemon` at a packaged path. This only affects a **built** `.dmg`/`.exe`,
  not `npm run dev`; flag it for the person who builds the release.
- Keep desktop changes additive; the UI redesign is still deferred.
- Once all three apps share the daemon, `config.json` has a single in-memory
  owner — no more last-writer-wins races between apps.
