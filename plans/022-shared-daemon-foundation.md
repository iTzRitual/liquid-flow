# Plan 022: Shared daemon foundation — one Controller, many thin clients

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 79f68de..HEAD -- packages/core/src/controller.js packages/core/src/log.js packages/core/src/store.js packages/core/index.js apps/desktop/electron/main.js`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1 (foundation — plans 023/024/025 depend on it)
- **Effort**: L
- **Risk**: MED (new IPC layer, but purely additive — no existing app is
  migrated in this plan, so nothing regresses if the daemon is unused)
- **Depends on**: none
- **Category**: architecture / tech-debt
- **Planned at**: commit `79f68de`, 2026-07-02 (root version 0.9.140)

## Why this matters

Today CLI, desktop, and MCP each construct their own in-process `Controller`
(`new Controller()` in `apps/cli/src/useController.js:13`,
`apps/desktop/electron/main.js:24`, `apps/mcp/bin/liquidflow-mcp.js:8`). That
means three independent state machines: `config.json` is read once at
construction and never re-read, the `log.js` event bus is a **per-process
module singleton** (so log events never cross a process boundary), and each
`Controller` owns its own `SyncSession` + file watcher. Consequences the user
wants gone:

- Open the CLI, then the desktop → they show **different** logs and state.
- Save a shop/password in one app → the other doesn't see it until it restarts.
- Select the same template in two apps → **two watchers** race on the same
  folder and **two** auto-commit loops fight over the same git index.
- Watch logs in the CLI while driving work through MCP → impossible; the CLI's
  log buffer never receives the MCP process's entries.

This plan builds the shared layer that fixes all of it: a **headless daemon**
process that owns exactly one `Controller`, plus a **`DaemonClient`** (in
`@liquidflow/core`) that is API-compatible with `Controller` (same event names,
same method names) and talks to the daemon over a local Unix-domain socket
(named pipe on Windows). A `connectController()` factory auto-spawns the daemon
on first use and falls back to an in-process `Controller` if the daemon is
disabled. **This plan does not migrate any app** — it only adds the daemon,
client, and factory with tests. Plans 023 (CLI), 024 (MCP), 025 (desktop) swap
each app onto `connectController()` afterward.

## Current state

Files and facts the executor needs (all verified at `79f68de`):

- **`packages/core/src/controller.js`** — `Controller extends EventEmitter`.
  Emits `log`, `log:reset`, `mismatches`, `state`, `git`, `progress`. Holds all
  state; `getState()` returns `{ currentShop, currentTemplate, language,
  insecureTLS, logWrap, headerMode }`. Synchronous accessors the apps use:
  `getState()`, `getMismatches()`, `getLog(sinceId=0)`, `listShops()`,
  `currentFolder()`, `currentShopUrl()`, `localFilePath(file)`. Async methods:
  `signInShop`, `signInSaved`, `logout`, `removeShop`, `listTemplates`,
  `selectTemplate`, `unlockTemplate`, `runCommand`, `previewConflict`,
  `recheckMismatches`, `setLanguage`, `setUiPref`, and the `git*` family. There
  is a `dispose()` that detaches log listeners and disposes the session.
- **`packages/core/src/log.js`** — module singleton. `export const events = new
  EventEmitter()`. `Controller` subscribes to `events` `'entry'`/`'reset'` in
  its constructor and re-emits as `'log'`/`'log:reset'`. `getLog(0)` →
  `logbuf.since(0)` returns the whole active channel (≤1000 entries).
- **`packages/core/src/store.js`** — `const APP_DIR = process.env.LIQUID_FLOW_HOME
  || defaultAppDir()` (line 25). `APP_DIR` is **not exported**. `ensureAppDirs()`
  creates it. Config default has a stale `Port: 45678` (unused; do not rely on
  it). We will add one export here.
- **`apps/desktop/electron/main.js:90-145`** — `registerIpc(ctrl)` already maps
  string method names to `ctrl.*` calls. **These exact strings are the RPC
  surface we will reuse** (e.g. `'shops.signInSaved' → ctrl.signInSaved(id)`,
  `'templates.select' → ctrl.selectTemplate(tplId)`, `'git.checkpoint' →
  ctrl.gitCheckpoint(data.message, data.target)`). The `sys.*` handlers that use
  Electron `shell` (`sys.openFolder/openShop/openExternal`) are **OS/display
  concerns and must NOT move into the daemon** — the daemon has no display.
- **`packages/core/index.js`** — the barrel. Currently exports `Controller`,
  `ISklep24Client`, `SoapError`, `SyncSession`, `MismatchType`, translations,
  `store`, `git`, `log`, diff helpers.

### Conventions to follow (from `CLAUDE.md`)

- **ESM everywhere** (`"type":"module"`), Node ≥20. Code comments in **Polish**
  (match the surrounding files — see `controller.js`). Any user-visible string
  goes through `translations.js` (`pl`+`en`); the daemon/protocol is internal
  plumbing, so its own error strings are English technical literals like
  `git.js` (an established exception — do not add i18n keys for protocol errors).
- **Every commit bumps the patch version in all four `package.json`** (root,
  `apps/cli`, `packages/core`, `apps/mcp`) and adds a `CHANGELOG.md` section.
  Read the current version from `packages/core/package.json` and bump patch +1.
- **`npm test` must be 100% green before commit.** New logic module → new
  `*.test.js` beside it. Slow/less-deterministic tests (real process spawn) go
  in the **e2e** config (`vitest.e2e.config.js`), not `npm test`.
- Prefer hand-written minimal code over new dependencies. Use only Node
  built-ins (`node:net`, `node:child_process`, `node:fs`, `node:os`, `node:path`).
  **Do not add any npm dependency.**

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Unit/integration tests | `npm test` | exit 0, 100% green, includes `packages/core/src/daemon/daemon.test.js` |
| Single test file | `npx vitest run packages/core/src/daemon/daemon.test.js` | all pass |
| e2e (spawn) | `npm run test:e2e` | exit 0, includes the daemon-spawn e2e |
| Daemon smoke | `LIQUID_FLOW_HOME=$(mktemp -d) node packages/core/bin/liquidflow-daemon.js & sleep 1; kill %1` | starts and exits cleanly, no stack trace |

## Scope

**In scope** (create unless noted):
- `packages/core/src/daemon/protocol.js` (create) — framing + method map.
- `packages/core/src/daemon/server.js` (create) — `serve(controller, opts)`.
- `packages/core/src/daemon/client.js` (create) — `DaemonClient` +
  `connectController()` + spawn/discovery.
- `packages/core/src/daemon/daemon.test.js` (create) — in-process tests.
- `packages/core/bin/liquidflow-daemon.js` (create) — daemon entry point.
- `packages/core/src/store.js` (edit) — add `daemonSocketPath()` export only.
- `packages/core/index.js` (edit) — export the new surface.
- `packages/core/package.json` (edit) — add `bin`, bump version.
- `apps/cli/package.json`, `apps/mcp/package.json`, root `package.json` (edit) —
  version bump only.
- `CHANGELOG.md` (edit) — new section.
- `apps/cli/test/e2e/daemon-spawn.e2e.js` (create) — auto-spawn e2e.

**Out of scope** (do NOT touch — later plans do this):
- `apps/cli/src/useController.js`, `apps/mcp/**`, `apps/desktop/**` — no app is
  migrated here. If you feel you must edit one to prove the daemon works, that is
  a STOP condition; prove it with `daemon.test.js` instead.
- `Controller` behavior, event names, or method signatures — the daemon wraps
  the Controller as-is. Do not "improve" the Controller.
- Shell/OS-open operations (`sys.openFolder` etc.) — they stay app-local.

## Git workflow

- Branch: `advisor/022-shared-daemon-foundation`.
- Conventional Commits, English, **no** `Co-Authored-By` footer. Example from
  `git log`: `feat(core): add shared daemon + DaemonClient over unix socket`.
- Bump all four `package.json` + `CHANGELOG.md` in the same commit (repo rule).
- Do NOT push or open a PR unless the operator instructed it.

## Design (read fully before coding)

**Transport.** A local **Unix-domain socket** on macOS/Linux at
`<APP_DIR>/daemon.sock`; a **named pipe** `\\.\pipe\liquidflow-<hash>` on
Windows. Never TCP — no network exposure, and the socket inherits filesystem
permissions (chmod `0600` on unix). Framing: **newline-delimited JSON**, one
JSON object per line.

**Message shapes** (define as comments in `protocol.js`):
- Client → server: `{ t: 'call', id, method, arg }`.
- Server → client:
  - `{ t: 'snapshot', state, log, mismatches }` — sent once, immediately on
    connect (git follows as a normal `git` event, see below).
  - `{ t: 'event', event, payload }` where `event` ∈ `log`, `log:reset`,
    `mismatches`, `state`, `git`, `progress`.
  - `{ t: 'result', id, ok: true, value }` / `{ t: 'result', id, ok: false,
    error: { message } }`.

**Method map** (`buildMethods(ctrl)` in `protocol.js`) — the daemon's entire
RPC surface, keyed by the **same strings desktop already uses** plus a few pure
helpers. Copy this exactly:

```js
// packages/core/src/daemon/protocol.js
import { store, buildDiffRows } from '@liquidflow/core'; // NOTE: within core, import from local ./..; see below

export function buildMethods(ctrl) {
  return {
    'state.get': () => ctrl.getState(),
    'translations.get': () => ctrl.getTranslations(),
    'lang.set': (id) => ctrl.setLanguage(id),
    'ui.setPref': (d) => ctrl.setUiPref(d && d.key, d && d.value),

    'shops.list': () => ctrl.listShops(),
    'shops.current': () => ctrl.getCurrentShop(),
    'shops.signIn': (d) => ctrl.signInShop(d),
    'shops.signInSaved': (id) => ctrl.signInSaved(id),
    'shops.logout': () => ctrl.logout(),
    'shops.remove': (id) => ctrl.removeShop(id),

    'templates.list': () => ctrl.listTemplates(),
    'templates.select': (id) => ctrl.selectTemplate(id),
    'templates.unlock': (d) => ctrl.unlockTemplate(d),
    'templates.current': () => ctrl.getCurrentTemplate(),

    'sync.mismatches': () => ctrl.getMismatches(),
    'sync.recheck': () => ctrl.recheckMismatches(),
    'sync.command': (d) => ctrl.runCommand(d),
    'sync.previewConflict': (d) => ctrl.previewConflict(d && d.file, d && d.type),
    'log.since': (sinceId) => ctrl.getLog(sinceId || 0),

    'git.status': () => ctrl.gitStatus(),
    'git.enable': () => ctrl.gitEnable(),
    'git.settings': (d) => ctrl.gitSetSettings(d),
    'git.history': (limit) => ctrl.gitHistory(limit),
    'git.restore': (hash) => ctrl.gitRestore(hash),
    'git.setRemote': (url) => ctrl.gitSetRemote(url),
    'git.push': () => ctrl.gitPush(),
    'git.checkpoint': (d) => ctrl.gitCheckpoint(d && d.message, d && d.target),
    'git.uncommittedCount': () => ctrl.gitUncommittedCount(),
    'git.pull': () => ctrl.gitPull(),
    'git.listBranches': () => ctrl.gitListBranches(),
    'git.createBranch': (name) => ctrl.gitCreateBranch(name),
    'git.switchBranch': (d) => ctrl.gitSwitchBranch(d && d.name, { discard: !!(d && d.discard) }),
    'git.clone': (url) => ctrl.gitClone(url),

    // Pure path/URL helpers (no shell, safe in the daemon). Shell/OS-open
    // (openFolder/openShop/openExternal) intentionally stay app-local.
    'sys.currentFolder': () => ctrl.currentFolder(),
    'sys.currentShopUrl': () => ctrl.currentShopUrl(),
    'sys.localFilePath': (file) => ctrl.localFilePath(file),
  };
}
```

> Import note: inside `packages/core`, import from the local modules
> (`import * as store from '../store.js'`) rather than the package barrel, to
> avoid a circular import through `index.js`. `buildMethods` above only needs
> `ctrl`; drop the top import line if unused.

**Server (`serve(controller, { socketPath })`)**:
- `net.createServer`, listen on `socketPath`. On unix, before listening: if the
  path exists, try to connect to it — if a live server answers, **exit 0**
  (another daemon won the race); if it refuses (`ECONNREFUSED`/`ENOENT`), it's a
  stale socket → `fs.unlinkSync` it, then listen. After `listen`, on unix
  `fs.chmodSync(socketPath, 0o600)`.
- On each connection: send `{ t:'snapshot', state: ctrl.getState(), log:
  ctrl.getLog(0), mismatches: ctrl.getMismatches() }`, then
  `ctrl.gitStatus().then(g => sendToThisConn({ t:'event', event:'git',
  payload:g })).catch(()=>{})` so the new client primes git without broadcasting
  to others.
- Subscribe **once** (server-level) to the six controller events and broadcast
  each to all connections. Keep handler refs; remove them when the server
  closes.
- Handle `{ t:'call', id, method, arg }`: look up `methods[method]`; if missing,
  reply `ok:false` with `Unknown method: <name>`; else `await` it, reply
  `ok:true, value`. Never let a handler rejection crash the process — catch and
  reply `ok:false, error:{ message }`.
- **Lifecycle**: track connected socket count. When it drops to 0: if
  `ctrl.state.session` is truthy (a sync session is live), keep running (so an
  MCP-started sync isn't killed when a client briefly drops); otherwise start a
  60s idle timer that closes the server and exits. Any new connection cancels
  the timer. Also expose `close()` for tests (removes listeners, closes server,
  unlinks the socket) — `close()` must NOT `process.exit`.

**Client (`DaemonClient extends EventEmitter`)**:
- Static `async connect(socketPath)`: open `net.connect(socketPath)`, resolve
  once the socket `connect`s (reject on `error` before connect). Parse
  newline-delimited JSON from `data`.
- Maintains a **mirror** so the synchronous Controller accessors keep working:
  `this._state`, `this._mismatches = []`, `this._git = null`, and `this._log =
  []` (cap at 1000). On `snapshot`: set mirror, then emit `state`, `log:reset`
  (with the log array), `mismatches`. On `event`: update the matching mirror
  field and re-emit the event with the same name/payload (so subscribers written
  for `Controller` work unchanged); for `log`, push to `this._log`; for
  `log:reset`, replace `this._log`.
- `call(method, arg)`: allocate an incrementing `id`, send `{t:'call',...}`,
  return a Promise stored in a `Map`; resolve/reject on the matching `result`.
  Reject all pending on socket close.
- **Synchronous accessors** (mirror-backed, drop-in for Controller):
  `getState() → this._state`, `getMismatches() → this._mismatches`,
  `getLog(sinceId=0) → this._log.filter(e => e.Id > (sinceId||0))`.
- **Async method wrappers** matching Controller names, each delegating to
  `call(...)` with the right method string, e.g.
  `signInSaved(id){ return this.call('shops.signInSaved', id); }`,
  `selectTemplate(id){ return this.call('templates.select', id); }`,
  `listShops(){ return this.call('shops.list'); }` (note: over the daemon,
  `listShops` is **async** — the CLI migration accounts for that),
  `runCommand(d){ return this.call('sync.command', d); }`,
  `gitCheckpoint(message, target){ return this.call('git.checkpoint', { message, target }); }`,
  and so on for every method in the map. Provide `currentFolder()`,
  `currentShopUrl()`, `localFilePath(file)` as **async** wrappers over the
  `sys.*` methods.
- `dispose()`: **only** ends the client socket — it must NOT tell the daemon to
  dispose the shared Controller. (Apps call `dispose()` on unmount; that should
  just disconnect this client and leave the daemon running for others.)

**Factory + auto-spawn (`connectController(opts)` in `client.js`)**:
```js
export async function connectController(opts = {}) {
  if (process.env.LIQUID_FLOW_NO_DAEMON === '1') {
    const { Controller } = await import('../controller.js');
    return new Controller(opts);              // fallback: in-process, today's behavior
  }
  const socketPath = store.daemonSocketPath();
  try {
    return await DaemonClient.connect(socketPath);      // daemon already up
  } catch {
    await spawnDaemon(opts);                              // detached child
    return await connectWithRetry(socketPath, 50, 100);  // 50 tries × 100ms = 5s
  }
}
```
- `spawnDaemon(opts)`: `child_process.spawn(process.execPath, [daemonBinPath],
  { detached: true, stdio: 'ignore', env: { ...process.env } })` then
  `child.unref()`. `daemonBinPath = fileURLToPath(new URL('../../bin/liquidflow-daemon.js', import.meta.url))`.
  Pass `LIQUID_FLOW_HOME`/`LIQUID_FLOW_INSECURE` through `env` (they're already in
  `process.env`). If two clients spawn at once, the loser exits on the
  stale-socket/EADDRINUSE path above; both `connectWithRetry` onto the winner.
- `connectWithRetry(path, tries, delayMs)`: loop `DaemonClient.connect`, sleep on
  failure, throw after `tries`.

**Daemon entry (`packages/core/bin/liquidflow-daemon.js`)**:
```js
#!/usr/bin/env node
// Nagłówek: proces-demon trzymający JEDEN Controller współdzielony przez CLI/desktop/MCP.
import { Controller } from '../src/controller.js';
import { serve } from '../src/daemon/server.js';
import * as store from '../src/store.js';

const ctrl = new Controller({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
const server = serve(ctrl, { socketPath: store.daemonSocketPath() });

const shutdown = () => { try { server.close(); } catch {} try { ctrl.dispose(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

## Steps

### Step 1: Add `daemonSocketPath()` to `store.js`

After the path helpers (near `metaDir`, ~line 110), add:

```js
// Ścieżka gniazda demona (Unix socket / named pipe). Podąża za LIQUID_FLOW_HOME
// przez APP_DIR, więc testy z tmp-home dostają własne gniazdo.
export function daemonSocketPath() {
  if (process.platform === 'win32') {
    const crypto = require('node:crypto'); // NIE — patrz niżej: użyj importu ESM
    return '\\\\.\\pipe\\liquidflow-' + crypto.createHash('sha1').update(APP_DIR).digest('hex').slice(0, 16);
  }
  ensureAppDirs();
  return path.join(APP_DIR, 'daemon.sock');
}
```

`store.js` is ESM (no `require`). Add `import crypto from 'node:crypto'` — it is
**already imported** at the top of `store.js` (line 10: `import crypto from
'node:crypto'`). Use that existing import; the Windows branch becomes
`crypto.createHash('sha1').update(APP_DIR).digest('hex').slice(0,16)`. Do not add
a second import.

**Verify**: `node -e "process.env.LIQUID_FLOW_HOME='/tmp/lf-x'; import('./packages/core/src/store.js').then(s=>console.log(s.daemonSocketPath()))"`
→ prints `/tmp/lf-x/daemon.sock` (on macOS/Linux).

### Step 2: Create `protocol.js`

Create `packages/core/src/daemon/protocol.js` with the `buildMethods(ctrl)`
function exactly as in the Design section (drop the unused top import). Add
Polish header comment describing the message shapes.

**Verify**: `node -e "import('./packages/core/src/daemon/protocol.js').then(m=>console.log(Object.keys(m.buildMethods({})).length))"`
→ prints `36` (the method count above: 4 core + 6 shops + 4 templates + 5
sync/log + 14 git + 3 sys). If your map has a different count, recount against
the Design block rather than adjusting this number.

### Step 3: Create `server.js`

Implement `serve(controller, { socketPath })` per Design. Return an object
`{ close() }`. Use `node:net`, `node:fs`. Handle the stale-socket / race path on
unix. Broadcast the six events. Implement the 60s idle-with-no-session shutdown
(use `unref()` on the idle timer so it never keeps the loop alive on its own).

**Verify**: covered by Step 6 tests. As an interim check:
`LIQUID_FLOW_HOME=$(mktemp -d) node packages/core/bin/liquidflow-daemon.js & sleep 1; ls "$LIQUID_FLOW_HOME"/daemon.sock 2>/dev/null && echo SOCKET_OK; kill %1`
→ prints `SOCKET_OK` (create the bin in Step 5 first, or defer this check).

### Step 4: Create `client.js`

Implement `DaemonClient`, `connectController`, `spawnDaemon`,
`connectWithRetry` per Design. Provide the full set of async method wrappers
covering every method string in `buildMethods` plus the mirror-backed sync
accessors `getState`/`getMismatches`/`getLog`.

**Verify**: `node -e "import('./packages/core/src/daemon/client.js').then(m=>console.log(typeof m.connectController, typeof m.DaemonClient))"`
→ prints `function function`.

### Step 5: Create the daemon bin + wire `package.json`

Create `packages/core/bin/liquidflow-daemon.js` per Design (mark it executable:
`chmod +x`). In `packages/core/package.json` add:
```json
"bin": { "liquidflow-daemon": "bin/liquidflow-daemon.js" },
```

**Verify**: `LIQUID_FLOW_HOME=$(mktemp -d) node packages/core/bin/liquidflow-daemon.js & sleep 1; kill %1; echo done`
→ starts without a stack trace, `done` prints.

### Step 6: Export from the barrel + write `daemon.test.js`

In `packages/core/index.js` add:
```js
export { connectController, DaemonClient } from './src/daemon/client.js';
export { serve as serveDaemon } from './src/daemon/server.js';
```

Create `packages/core/src/daemon/daemon.test.js` (Vitest). Model it on the
existing `packages/core/src/*.test.js` style. Use a **real `Controller` + real
unix socket** in the tmp home (the `test/setup/tmpHome.js` setupFile already
gives each test file an isolated `LIQUID_FLOW_HOME`). Do **not** spawn a
process here — call `serve(ctrl, { socketPath })` in-process and connect
`DaemonClient` to it. Cases:

1. **Snapshot on connect**: start `serve`; `DaemonClient.connect`; assert the
   client's `getState()` equals `ctrl.getState()` after the snapshot arrives.
2. **Two clients, cross-client state broadcast**: connect clients A and B; call
   `A.call('lang.set','en')` (or `A.setLanguage('en')`); assert B emits a
   `state` event with `language:'en'` and `B.getState().language === 'en'`.
   *(This is the "save in one app, visible in the other" guarantee.)*
3. **Log broadcast**: after connecting, drive a controller action that logs
   (e.g. `ctrl` connected to a mock-SOAP shop then `logbuf.logInfo(...)`, or
   simplest: call a method that emits a log); assert both clients receive a
   `log` event and their `getLog(0)` mirror grew.
4. **RPC error propagation**: `await expect(client.call('git.enable')).rejects`
   with the "no active template" message (calling git.enable with no session
   throws `NoActiveTemplate`).
5. **Unknown method**: `await expect(client.call('does.not.exist')).rejects`
   matching `/Unknown method/`.
6. **`dispose()` only disconnects**: dispose client A; assert the server is
   still serving (client B still gets a subsequent broadcast) — proves a client
   leaving does not tear down the shared Controller.

Clean up in `afterEach`/`afterAll`: `client.dispose()` for each, `server.close()`,
`ctrl.dispose()`, and `logbuf.setActiveChannel('app')` (per the repo's test
isolation rule).

**Verify**: `npx vitest run packages/core/src/daemon/daemon.test.js` → all pass.

### Step 7: Auto-spawn e2e (separate config)

Create `apps/cli/test/e2e/daemon-spawn.e2e.js` (runs under
`vitest.e2e.config.js`, NOT `npm test`). It: sets a fresh `LIQUID_FLOW_HOME`
(tmp dir), calls `connectController()` with no daemon running, asserts a daemon
process was spawned and `getState()` returns a valid object, then `dispose()`s.
Give it a generous timeout (spawn + 5s retry). If node-pty/spawn constraints
from `test/helpers/cliPty.js` apply (env scrubbing of `NODE_OPTIONS`/`VITEST_*`),
reuse that helper's env-cleaning approach for the spawned daemon.

**Verify**: `npm run test:e2e` → passes including the new file. If the spawn
proves flaky in the e2e harness, mark the test `it.skip` with a `TODO(022)`
comment **and report it in NOTES** — do not delete it, and do not let it block
`npm test` (it's not in that config anyway).

### Step 8: Version bump + CHANGELOG + full gate

Bump patch +1 in all four `package.json` (root, `apps/cli`, `packages/core`,
`apps/mcp`) from the current `packages/core/package.json` version. Add a
`CHANGELOG.md` section at the top:

```
## [X.Y.Z] — 2026-07-02
### Added
- Shared daemon foundation: a headless process (`liquidflow-daemon`) owning one
  Controller, with `DaemonClient` and a `connectController()` factory in
  `@liquidflow/core` for CLI/desktop/MCP to attach over a local socket. No app
  is migrated yet (plans 023–025). `LIQUID_FLOW_NO_DAEMON=1` forces in-process.
```

**Verify**: `npm test` → exit 0, 100% green, includes `daemon.test.js`;
`grep -h '"version"' package.json apps/cli/package.json packages/core/package.json apps/mcp/package.json`
→ all four identical.

## Test plan

- New: `packages/core/src/daemon/daemon.test.js` — six cases above (snapshot,
  cross-client broadcast, log broadcast, RPC error, unknown method,
  dispose-isolation). Model structure on an existing core integration test such
  as `packages/core/src/controller.test.js`.
- New (e2e): `apps/cli/test/e2e/daemon-spawn.e2e.js` — real auto-spawn.
- No existing test should change. If one breaks, it is a regression in this
  plan's additive code — fix the code, not the test.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0, 100% green, and `daemon.test.js` runs with ≥6 passing cases.
- [ ] `npm run test:e2e` exits 0 (or the spawn test is `it.skip` with a reported reason).
- [ ] `node packages/core/bin/liquidflow-daemon.js` under a tmp `LIQUID_FLOW_HOME`
      creates `daemon.sock` and exits cleanly on SIGTERM.
- [ ] `LIQUID_FLOW_NO_DAEMON=1` path returns a real in-process `Controller`
      (assert in a test or `node -e`).
- [ ] Four `package.json` versions identical and bumped; `CHANGELOG.md` has the new section.
- [ ] `git status` shows only in-scope files changed; **no** file under
      `apps/cli/src/`, `apps/mcp/`, or `apps/desktop/` (except the new e2e file)
      is modified.
- [ ] `plans/README.md` row for 022 updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `79f68de`).
- You find yourself needing to change `Controller`, its event names, or a method
  signature to make the client work — the client must adapt to the Controller,
  not vice versa.
- You need to edit a CLI/MCP/desktop source file to make the daemon function
  (proving it belongs to those apps' migration plans, not this one).
- `net` unix-socket binding fails on the test platform in a way that isn't the
  stale-socket case — report the platform and error rather than switching to TCP.
- Named-pipe behavior on Windows can't be verified in your environment — implement
  it per the design, note in NOTES that it is unverified, and do not block on it
  (the reviewer runs on macOS).

## Maintenance notes

- **Version-bump collision risk** (same trap as plan 021): if this lands via a
  worktree cut before other version bumps, rebase onto current `main` (or defer
  the bump to merge time) so the four `package.json` files don't conflict.
- The RPC method map in `protocol.js` is the daemon's public contract. When a
  future `Controller` method needs to be reachable by an app, add it there (and
  a wrapper on `DaemonClient`). Keep shell/OS-open operations out of the daemon.
- Idle-shutdown policy (60s with no clients and no active session) is a
  judgment call — if users want a persistent background daemon, expose an env
  toggle later. Watch for zombie daemons in review.
- Snapshot log is capped by the active channel (≤1000). A late-joining client
  gets the current channel only, matching today's per-process behavior.
- Follow-ons: plan 023 (CLI), 024 (MCP), 025 (desktop) each swap
  `new Controller()` → `await connectController()`. They depend on this plan
  being DONE.
