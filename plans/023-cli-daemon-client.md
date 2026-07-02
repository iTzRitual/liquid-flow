# Plan 023: Migrate the CLI onto the shared daemon (`connectController`)

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done (unless a
> reviewer maintains the index).
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA of 022 merge>..HEAD -- apps/cli/src/useController.js apps/cli/src/App.jsx apps/cli/src/commands.js`
> Compare "Current state" excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (the CLI's `useController` uses several **synchronous**
  Controller reads that become async over the daemon)
- **Depends on**: plan 022 (DONE — `connectController`/`DaemonClient` exist and
  are exported from `@liquidflow/core`)
- **Category**: architecture / migration
- **Planned at**: fill with `git rev-parse --short HEAD` when 022 is merged.

## Why this matters

After plan 022 the daemon and `DaemonClient` exist but nothing uses them. This
plan makes the CLI a **thin client**: instead of `new Controller()`, the CLI
calls `await connectController()` and attaches to the shared daemon. Then the
CLI shows the *same* live log and state as any other attached app (desktop,
MCP), a shop/password saved elsewhere appears live, and driving work through
MCP is visible in the CLI in real time — which is exactly the user's "open CLI
to watch, do the job through MCP" scenario. Closing the CLI leaves the daemon
(and any active sync) running for the other clients.

## Current state

- **`apps/cli/src/useController.js`** (whole file is the integration point).
  Key lines:
  - `13`: `ref.current = new Controller({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });`
    — synchronous construction inside a `useRef`.
  - `17`: `const [state, setState] = useState(() => ctrl.getState());` — **sync** read.
  - `20`: `useState(() => translationsFor(ctrl.getState().language))` — **sync** read.
  - `27`: `useState(() => ctrl.listShops())` — **sync** read (async over daemon).
  - `52-58`: subscribes to `log`, `log:reset`, `mismatches`, `state`, `git`,
    `progress` via `ctrl.on(...)`.
  - `59-61`: primes `setLog(ctrl.getLog(0))`, `setState(ctrl.getState())`,
    `setShops(ctrl.listShops())` — all **sync**.
  - `70`: `ctrl.dispose()` in cleanup.
  - `74`: `refreshShops = () => setShops(ctrl.listShops())` — **sync**.
- **`DaemonClient` contract from plan 022**: `getState()`, `getMismatches()`,
  `getLog(0)` are **synchronous mirror reads** (safe to call as today). But
  `listShops()`, `currentFolder()`, and every command method are **async**
  (return Promises). The client emits the identical event names, and sends a
  `snapshot` on connect that fires `state`, `log:reset`, and `mismatches`
  immediately — so a listener attached before the snapshot will get primed
  automatically.
- CLI commands live in `apps/cli/src/commands.js` and call `ctx.ctrl.*`
  (e.g. `ctrl.selectTemplate`, `ctrl.runCommand`, `ctrl.currentFolder` for
  `/open`). Most are already `await`ed. `currentFolder()` becoming async is the
  one to watch.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | exit 0, green |
| CLI e2e | `npm run test:e2e` | exit 0 |
| Manual TTY smoke | `LIQUID_FLOW_HOME=$(mktemp -d) script -q /dev/null node apps/cli/bin/liquidflow.js` | boots, log/header render |

## Scope

**In scope**:
- `apps/cli/src/useController.js` (edit) — swap to `connectController`, make the
  few sync reads async-safe.
- `apps/cli/src/commands.js` (edit) — only if a call site relies on a now-async
  method (e.g. `currentFolder()` for `/open`); `await` it.
- Four `package.json` version bumps + `CHANGELOG.md`.
- A test for the new async-init behavior if practical (see Test plan).

**Out of scope**:
- `packages/core/**` — the daemon/client already exist; do not change them.
- `apps/mcp/**`, `apps/desktop/**` — separate plans (024, 025).
- CLI layout/rendering logic (Header/LogPane/etc.) — behavior must be unchanged.

## Git workflow

- Branch: `advisor/023-cli-daemon-client`.
- Conventional Commits, English, no `Co-Authored-By`. Example:
  `refactor(cli): attach to shared daemon via connectController`.
- Bump all four `package.json` + `CHANGELOG.md`.

## Steps

### Step 1: Make `useController` construct the client asynchronously

Replace the synchronous `new Controller()` in the `useRef` with an async
`connectController()` obtained in a `useEffect`, and guard the initial render
until the client is ready. Target shape:

```js
import { connectController, translationsFor } from '@liquidflow/core';
// ...
export function useController() {
  const [ctrl, setCtrl] = useState(null);   // zamiast useRef + new Controller()
  const [ready, setReady] = useState(false);
  const [state, setState] = useState(null);
  const [t, setT] = useState(() => translationsFor('pl')); // domyślny do czasu snapshotu
  const [mismatches, setMismatches] = useState([]);
  const [log, setLog] = useState([]);
  const [logVersion, setLogVersion] = useState(0);
  const [git, setGit] = useState(null);
  const [shops, setShops] = useState([]);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let client = null; let disposed = false;
    (async () => {
      client = await connectController({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
      if (disposed) { client.dispose(); return; }
      // subskrypcje — te same nazwy zdarzeń co dotąd
      client.on('log', onLog);
      client.on('log:reset', onLogReset);
      client.on('mismatches', onMis);
      client.on('state', onState);
      client.on('git', onGit);
      client.on('progress', onProgress);
      // snapshot z daemona odpala state/log:reset/mismatches sam,
      // ale i tak dokładamy shopy (async) i prime'ujemy stan:
      setState(client.getState());
      setT(translationsFor(client.getState().language));
      setLog(client.getLog(0));
      setShops(await client.listShops());
      setCtrl(client);
      setReady(true);
    })();
    return () => { disposed = true; if (client) { /* odepnij + */ client.dispose(); } };
  }, []);
  // ...
  return { ctrl, ready, t, state, mismatches, log, logVersion, git, shops, progress, refreshShops, clearLog };
}
```

Notes:
- Define the `onLog`/`onLogReset`/`onMis`/`onState`/`onGit`/`onProgress`
  handlers (same bodies as the current file, `useController.js:31-50`). Keep
  `onState` updating `state`, `t`, and shops — but shops is now async: inside
  `onState` do `client.listShops().then(setShops)` instead of the sync call.
- `refreshShops` becomes `useCallback(() => { if (ctrl) ctrl.listShops().then(setShops); }, [ctrl])`.
- Remove the old `useRef`/`new Controller()`.

**Verify**: `node -e "0"` is not enough — run `npm test` (Step 4) and the manual
TTY smoke. Interim: `grep -n "new Controller" apps/cli/src/useController.js` → no matches.

### Step 2: Guard `App.jsx` render until `ready`

The hook now yields `ctrl === null` on the first paint. Find where `App.jsx`
consumes `useController()` and render a minimal "connecting" state (or the
existing loader) while `!ready`. Keep it tiny — a single centered line using an
existing translation key if one fits (e.g. reuse the loader/spinner already used
for template download) or a neutral `…`. Do not add a new i18n key unless
necessary; if you must, add it to **both** `pl` and `en` in
`packages/core/src/translations.js` (that would expand scope — prefer reusing an
existing key).

**Verify**: manual TTY smoke boots to the normal UI (no crash on null `ctrl`).

### Step 3: `await` any now-async accessor at call sites

Search commands/components for synchronous use of methods that became async on
the client: `currentFolder()`, `currentShopUrl()`, `localFilePath(...)`,
`listShops()`. In `apps/cli/src/commands.js`, the `/open` command uses
`ctrl.currentFolder()` — `await` it. Do the same for any other sync usage found.

**Verify**: `grep -rn "currentFolder()\|currentShopUrl()\|localFilePath(" apps/cli/src`
→ every hit is `await`ed or inside an `async` `.then(...)`.

### Step 4: Version bump + CHANGELOG + gate

Bump all four `package.json`, add a `CHANGELOG.md` `### Changed` entry ("CLI now
attaches to the shared Liquid Flow daemon so logs/state are shared live across
apps"). Run the gate.

**Verify**: `npm test` exit 0; `npm run test:e2e` exit 0 (the e2e boots the real
binary — it will now spawn/attach a daemon; confirm `connect.e2e.js` still
passes end-to-end).

## Test plan

- The existing `apps/cli/test/e2e/connect.e2e.js` is the key regression guard —
  it drives the real binary through ConnectList → SignIn → template picker. With
  the daemon in play it now exercises auto-spawn + attach. It must still pass.
- If feasible, add a small unit test that `useController` (or a thin extracted
  helper) tolerates async init — but Ink hook testing is heavy; the e2e is the
  primary gate. If you add one, follow `apps/cli/src/*.test.js` patterns.
- Manual: two terminals against the same `LIQUID_FLOW_HOME` — connect a shop in
  one, confirm the other reflects it live (this is the user-visible payoff;
  note the result in NOTES).

## Done criteria

- [ ] `grep -n "new Controller" apps/cli/src/useController.js` → no matches.
- [ ] `npm test` exit 0, green.
- [ ] `npm run test:e2e` exit 0, `connect.e2e.js` passes.
- [ ] Manual TTY smoke boots and renders normally; `/exit` quits the CLI but
      leaves the daemon running if another client is attached.
- [ ] Four `package.json` bumped; `CHANGELOG.md` updated.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` row updated.

## STOP conditions

- `connectController` is not exported from `@liquidflow/core` → plan 022 isn't
  merged; STOP.
- The CLI relies on a synchronous Controller behavior that has no async
  equivalent and can't be adapted without changing core → report it.
- e2e `connect.e2e.js` fails specifically because the daemon spawn conflicts
  with the pty harness env-scrubbing (`NODE_OPTIONS`/`VITEST_*`) → report; the
  fix likely belongs in `spawnDaemon`'s env handling (plan 022 territory).

## Maintenance notes

- The daemon is now started implicitly by the first CLI launch. If a user runs
  the old `LIQUID_FLOW_NO_DAEMON=1`, the CLI reverts to a private in-process
  Controller (useful for debugging).
- Watch for double `dispose()` semantics: CLI unmount must only disconnect the
  client, never tear down a daemon still serving other apps (guaranteed by
  plan 022's `DaemonClient.dispose`).
- When 024/025 land, all three apps share one process — verify no app assumes
  it is the sole writer of `config.json`.
