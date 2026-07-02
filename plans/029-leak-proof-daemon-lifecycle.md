# Plan 029: Leak-proof daemon lifecycle (no orphaned daemons, clean start)

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git log --oneline -3` and confirm `packages/core/src/daemon/server.js:15` still
> reads `if (controller.state && controller.state.session) return;` and line 20 is
> `process.exit(0);` inside `scheduleIdleCheck`. On mismatch, re-read the file
> before editing; if the session guard is already gone, STOP and report.

## Status

- **Priority**: P1 (process leak — daemons accumulate and never die)
- **Effort**: M
- **Risk**: MED (touches the shared-daemon lifetime; a wrong teardown could kill a
  daemon while a client is still attached — the tests below guard exactly this)
- **Depends on**: plans 022, 028 (DONE).
- **Category**: correctness / resource lifecycle
- **Planned at**: `<fill: git rev-parse --short HEAD>`

## The problem (observed on the user's machine)

The daemon is meant to be a **singleton per data dir** that lives only while apps
need it. In practice **four** daemons were found running at once, two of them
11 hours old, orphaned from finished test runs, plus a stale one on the pre-028
desktop path. Root causes:

1. **A daemon with an active sync session NEVER schedules teardown.**
   `server.js:15` (`if (controller.state.session) return;`) and the same guard at
   line 18 mean: connect a shop → select a template → close every UI, and the
   daemon keeps running **forever** with a live file-watcher, syncing into the void.
   There is no client left, yet the process persists. This is the leak.
2. **Idle teardown is only ever scheduled on client disconnect**, never at daemon
   startup — so a daemon that spawns but whose connecting client dies before
   attaching can linger with zero clients and no session.
3. **Tests/e2e spawn detached daemons and never reap them** — the two 11-hour
   zombies came from `apps/cli/test/e2e/daemon-spawn.e2e.js` (auto-spawn e2e) and a
   `connectController` call under a tmp home; `afterEach` removes the home dir but
   leaves the daemon process running.
4. **The desktop spawns the daemon with the Electron binary** (`spawnDaemon` uses
   `process.execPath`, which in Electron's main process is Electron, not node) — a
   heavyweight GUI runtime running a headless daemon.

## Decided behavior (from the maintainer)

- **No manual `stop` command.** The daemon must be self-managing; a manual stop is
  awkward because it would also tear down other attached apps.
- **Clean start** — the daemon does **not** persist a session for absent clients.
  When the last client disconnects, the daemon shuts down (after a short grace);
  on the next launch you re-select the shop/template. No session lingers in the
  background. (Session persistence / auto-resume was explicitly declined.)
- **New lifetime rule**: the daemon lives exactly as long as ≥1 client is
  connected, plus a short grace window (default 10 s) to bridge app restarts and
  brief MCP reconnects. Zero clients past the grace ⇒ the daemon exits cleanly.
  This is inherently leak-proof: no client ⇒ no daemon ⇒ no background watcher.

## Current state (verified at plan-time)

- **`packages/core/src/daemon/server.js`** — `serve(controller, { socketPath })`.
  `scheduleIdleCheck()` (lines 13-24): bails if `clients.size>0`, if `isClosed`,
  **and if a session is active** (line 15); otherwise a 60 s `unref`'d timer calls
  `closeServer(); process.exit(0)` (lines 17-22, guarded again by the session
  check at line 18). `scheduleIdleCheck` is called only from `cleanupClient`
  (line 91) on socket `close`/`error`. `startListening()` (154-161) does **not**
  schedule it. `closeServer()` (163-179) removes listeners, destroys clients,
  closes the server, unlinks the socket — but does **not** call
  `controller.dispose()`.
- **`packages/core/bin/liquidflow-daemon.js`** — 13 lines: builds `Controller`,
  `serve(ctrl, { socketPath: store.daemonSocketPath() })`, `SIGINT`/`SIGTERM` →
  `server.close(); ctrl.dispose(); process.exit(0)`. The idle path bypasses this
  `shutdown` (server calls `process.exit` directly), so `ctrl.dispose()` is skipped
  on idle exit today.
- **`packages/core/src/daemon/client.js:196-206`** — `spawnDaemon` does
  `spawn(process.execPath, [daemonBinPath], { detached:true, stdio:'ignore', env })`
  then `child.unref()`. `env` is a copy of `process.env` (+ optional
  `LIQUID_FLOW_INSECURE`). No `ELECTRON_RUN_AS_NODE`.
- **`packages/core/src/daemon/daemon.test.js`** — runs `serve()` **in-process**
  (not via the bin) and connects real `DaemonClient`s; `afterEach` disposes clients
  + calls `server.close()`. Because the current idle timer is guarded and `unref`'d
  and tests finish fast, `process.exit(0)` never fires during tests today. **After
  this change that safety disappears** unless `exit` is injectable (Step 1) — an
  in-process `process.exit(0)` would kill the Vitest worker.
- **`apps/cli/test/e2e/daemon-spawn.e2e.js`** — `mkdtempSync` home, sets
  `LIQUID_FLOW_HOME`, `connectController()` auto-spawns a real daemon, asserts
  `daemon.sock` exists. `afterEach` disposes the client and `rmSync`s the home but
  **never kills the spawned daemon**.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Unit/integration gate | `npm test` | exit 0, green |
| e2e (spawns real daemons) | `npm run test:e2e` | exit 0, green |
| Check no daemons leaked after e2e | `pgrep -fl liquidflow-daemon` (macOS/Linux) | empty (or only pre-existing ones you didn't start) |

## Scope

**In scope**:
- `packages/core/src/daemon/server.js` — new lifetime rule + injectable exit +
  startup idle scheduling + `controller.dispose()` on idle exit + pidfile.
- `packages/core/bin/liquidflow-daemon.js` — read optional idle env; nothing else
  structural.
- `packages/core/src/daemon/client.js` — `spawnDaemon` sets `ELECTRON_RUN_AS_NODE`.
- `packages/core/src/daemon/daemon.test.js` — inject no-op `exit`; add teardown
  tests.
- `apps/cli/test/e2e/daemon-spawn.e2e.js` — reap the spawned daemon in `afterEach`.
- Four `package.json` bumps + `CHANGELOG.md`.

**Out of scope (hard)**:
- Any `stop`/`status` slash command or CLI/MCP/desktop UI change — the maintainer
  declined a manual stop; this plan is lifecycle-only.
- Session persistence / auto-resume — explicitly declined (clean start).
- `apps/cli/src/**`, `apps/mcp/**`, `apps/desktop/**` source — no client-side
  changes needed; the lifetime rule lives entirely in the daemon.
- Killing the **currently** running orphan daemons — that's a one-time manual
  `pkill -f liquidflow-daemon` the maintainer runs; this plan prevents *future*
  leaks.

## Git workflow

- Branch: `advisor/029-leak-proof-daemon-lifecycle`.
- Conventional Commits, English, no `Co-Authored-By`. Suggested:
  `fix(core): daemon exits when no clients remain (leak-proof lifecycle)`.
- Bump all four `package.json` + `CHANGELOG.md` (`### Fixed`).

## Steps

### Step 1: Rewrite the daemon lifetime rule in `server.js`

Change the `serve` signature to accept an idle window and an injectable exit
(keep defaults so the bin needs no change):

```js
export function serve(controller, { socketPath, idleMs = 10000, exit = () => process.exit(0) }) {
```

Replace `scheduleIdleCheck` and its timer so it **no longer exempts an active
session** — the ONLY thing that keeps the daemon alive is a connected client:

```js
function scheduleIdleCheck() {
  if (clients.size > 0 || isClosed) return;      // a client is attached → stay up
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (clients.size === 0 && !isClosed) {        // still nobody after the grace → shut down
      closeServer();
      try { controller.dispose && controller.dispose(); } catch {}
      exit();
    }
  }, idleMs);
  if (idleTimer.unref) idleTimer.unref();
}
```

Note the removed `controller.state.session` checks in **both** the guard and the
timer body — that is the core fix. `closeServer()` already unlinks the socket and
removes listeners; we add `controller.dispose()` so the file-watcher is torn down
before exit (the bin's `shutdown` did this for signals; the idle path must too).

Then **schedule an idle check at startup** so a daemon that never gets a healthy
client can't linger. In `startListening()`'s `listen` callback, after the
`chmodSync`, add `scheduleIdleCheck();`:

```js
server.listen(socketPath, () => {
  if (process.platform !== 'win32') {
    try { fs.chmodSync(socketPath, 0o600); } catch {}
  }
  writePidFile();          // Step 1b
  scheduleIdleCheck();     // if no client attaches within idleMs, exit
});
```

The first real client connects within milliseconds and calls `cancelIdleCheck()`
(existing line 56), so this only bites orphaned spawns.

**Step 1b — pidfile** (deterministic reaping + observability, replaces the need
for a `status` command). Near the top of `serve`, derive a pid path next to the
socket and add helpers:

```js
import path from 'node:path';
// ...
const pidPath = process.platform === 'win32'
  ? null                                   // named pipes have no dir; skip pidfile on win
  : path.join(path.dirname(socketPath), 'daemon.pid');

function writePidFile() {
  if (!pidPath) return;
  try { fs.writeFileSync(pidPath, String(process.pid)); } catch {}
}
function removePidFile() {
  if (!pidPath) return;
  try { fs.unlinkSync(pidPath); } catch {}
}
```

Call `removePidFile()` inside `closeServer()` (right where the socket is unlinked).

**Verify**: `grep -n "controller.state.session" packages/core/src/daemon/server.js`
→ **no matches**. `grep -n "idleMs\|exit\|writePidFile\|scheduleIdleCheck" server.js`
shows the new wiring.

### Step 2: Let the bin tune the idle window (optional env), keep signal shutdown

In `packages/core/bin/liquidflow-daemon.js`, pass an idle window overridable by env
(lets the e2e force a quick reap and keeps prod at the 10 s default):

```js
const idleMs = Number(process.env.LIQUID_FLOW_DAEMON_IDLE_MS) || 10000;
const server = serve(ctrl, { socketPath: store.daemonSocketPath(), idleMs });
```

Leave the `SIGINT`/`SIGTERM` → `server.close(); ctrl.dispose(); process.exit(0)`
handler as-is. Do **not** pass a custom `exit` here — the default `process.exit(0)`
is correct for the real daemon; `controller.dispose()` now runs inside the idle
path via Step 1.

**Verify**: `node -e "process.env.LIQUID_FLOW_HOME=require('os').tmpdir()+'/lf-t-'+Date.now(); import('./packages/core/bin/liquidflow-daemon.js')"`
then in another shell `pgrep -fl liquidflow-daemon` — with no client connecting, the
daemon exits on its own within ~10 s (or set `LIQUID_FLOW_DAEMON_IDLE_MS=1000` to
watch it go in ~1 s). Confirm the process is gone afterward.

### Step 3: Spawn the daemon as node even from Electron

In `packages/core/src/daemon/client.js`, `spawnDaemon`, add `ELECTRON_RUN_AS_NODE`
to the child env so an Electron `process.execPath` runs the bin as a plain Node
process (the flag is a **no-op for real Node**, so this is safe for CLI/MCP too):

```js
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
if (opts.insecureTLS) env.LIQUID_FLOW_INSECURE = '1';
```

**Verify**: `grep -n "ELECTRON_RUN_AS_NODE" packages/core/src/daemon/client.js` →
present. (Manual, later: launch `npm run dev`, then
`ps -o command= -p $(pgrep -f liquidflow-daemon)` shows the daemon running headless
as node, not spinning up an Electron window.)

### Step 4: Make the daemon tests safe + prove the teardown

In `packages/core/src/daemon/daemon.test.js`:

1. **Inject a no-op exit into every `serve(...)` call** so an in-process idle timer
   can never kill the Vitest worker. Change each `serve(ctrl, { socketPath })` to
   `serve(ctrl, { socketPath, exit: () => {}, idleMs: 50 })` — a tiny `idleMs`
   keeps the teardown tests fast; the no-op `exit` keeps the worker alive. (A small
   `idleMs` is harmless for the snapshot/broadcast tests because they connect a
   client immediately, cancelling the timer.)
2. **Add two tests** (follow the existing `it(...)` + `DaemonClient.connect` style,
   using the per-test `socketPath` the file already sets up):

   ```js
   it('shuts down (calls exit) after the last client disconnects', async () => {
     let exited = 0;
     server = serve(ctrl, { socketPath, idleMs: 30, exit: () => { exited++; } });
     const client = await DaemonClient.connect(socketPath);
     client.dispose();
     await new Promise((r) => setTimeout(r, 120));   // > idleMs, let the timer fire
     expect(exited).toBe(1);
   });

   it('stays up (does not exit) while a client is connected — even with a session', async () => {
     let exited = 0;
     // simulate an active session; the old code would keep it up, the new code keeps
     // it up ONLY because a client is attached — assert exit is NOT called here.
     ctrl.state = { ...(ctrl.state || {}), session: {} };
     server = serve(ctrl, { socketPath, idleMs: 30, exit: () => { exited++; } });
     const client = await DaemonClient.connect(socketPath);
     await new Promise((r) => setTimeout(r, 120));
     expect(exited).toBe(0);   // client attached → never idle
     client.dispose();
   });
   ```

   Adjust `ctrl.state` mutation to match how the test's controller exposes state
   (if it's a real `Controller`, set the field it reads in `getState()`; if it's a
   stub, mirror that stub's shape). The point of test #2 is to prove the daemon no
   longer relies on "no session" to shut down and no longer *stays up* for a session
   with nobody watching — a connected client is the sole keep-alive.

**Verify**: `npm test` — the two new tests pass; the whole `daemon.test.js` suite
stays green and the Vitest run does **not** abort mid-file (which is what a stray
`process.exit(0)` would cause).

### Step 5: Reap the spawned daemon in the e2e

In `apps/cli/test/e2e/daemon-spawn.e2e.js`, before `rmSync(home)`, kill the daemon
using the pidfile (deterministic) with a `pkill` fallback:

```js
afterEach(async () => {
  if (ctrl) { try { ctrl.dispose(); } catch {} ctrl = null; }
  if (home) {
    try {
      const pidPath = path.join(home, 'daemon.pid');
      if (fs.existsSync(pidPath)) {
        const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
        if (pid > 0) { try { process.kill(pid, 'SIGTERM'); } catch {} }
      }
    } catch {}
    try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
    home = null;
  }
});
```

Optionally set `process.env.LIQUID_FLOW_DAEMON_IDLE_MS = '1000'` at the top of the
test so even without the kill the daemon self-reaps in ~1 s (belt and suspenders).

**Verify**: `npm run test:e2e` green, then `pgrep -fl liquidflow-daemon` shows no
daemon on a `lf-daemon-e2e-*` socket left behind.

### Step 6: Version bump + CHANGELOG + gate

Bump all four `package.json`; add a `CHANGELOG.md` `### Fixed` entry, e.g.:
"Daemon now shuts down cleanly once the last client disconnects (after a short
grace) instead of running forever whenever a sync session was active — no more
orphaned `liquidflow-daemon` processes. Tests/e2e reap spawned daemons; the
Electron-hosted daemon now runs headless as node; a `daemon.pid` file is written
next to the socket."

**Verify**: `npm test` exit 0; `npm run test:e2e` exit 0.

## Test plan

- New `daemon.test.js` cases are the regression guard for the lifetime rule:
  exit-after-last-client and stay-up-while-connected. They also lock in the
  injectable `exit` so the daemon lifecycle stays unit-testable.
- The e2e reap + `pgrep` check proves real spawned daemons don't leak.
- **Manual acceptance** (record in NOTES): `pkill -f liquidflow-daemon` to start
  clean; `npm run cli`, connect a shop, select a template; `/exit`; within ~10 s
  `pgrep -fl liquidflow-daemon` is empty (no lingering watcher). Then `npm run cli`
  again → you re-select the template (clean start, nothing auto-connected).
- **Manual MCP-anchor check** (optional, matches the maintainer's use case): open
  `npm run cli` and keep it; drive via MCP → CLI shows it live; close MCP but keep
  CLI → daemon stays (CLI is the anchor client); close CLI → daemon exits within
  the grace.

## Done criteria

- [ ] `grep -n "controller.state.session" packages/core/src/daemon/server.js` → none.
- [ ] `serve` accepts `idleMs` + injectable `exit`; idle check scheduled at startup;
      `controller.dispose()` called on idle exit; `daemon.pid` written next to the
      socket and removed on close.
- [ ] `spawnDaemon` sets `ELECTRON_RUN_AS_NODE=1`.
- [ ] `daemon.test.js`: no `serve()` call can `process.exit` the worker; two new
      teardown tests pass; `npm test` exit 0, green.
- [ ] `daemon-spawn.e2e.js` reaps the daemon; `npm run test:e2e` exit 0; no
      `liquidflow-daemon` left on a test socket afterward.
- [ ] Manual: after `/exit`, no daemon lingers within the grace; relaunch requires
      re-selecting the template (clean start).
- [ ] Four `package.json` bumped; `CHANGELOG.md` updated; `plans/README.md` row.

## STOP conditions

- Removing the session guard makes an existing test red in a way that asserts "the
  daemon stays up with a session and no clients" → that's the **old** behavior this
  plan deliberately changes; update that assertion to the new rule (exit when no
  clients), don't restore the guard. If the red test is something else (a real
  regression), fix the code, not the test.
- The daemon exits **while a client is still connected** (manual check: template
  drops mid-session) → the `clients.size` bookkeeping or `cancelIdleCheck` wiring
  broke; the teardown must only fire at `clients.size === 0`. STOP and re-check.
- `process.exit(0)` fires during `npm test` (worker aborts) → a `serve()` call in
  the tests is missing the injected no-op `exit`; add it. STOP until the suite runs
  to completion.
- You find yourself adding a stop/status command or session persistence → out of
  scope; the maintainer declined both. STOP.

## Maintenance notes

- The daemon is now a pure "session bus": alive only while ≥1 client is attached
  (+ `idleMs` grace). Any future long-running background behavior (e.g. keep
  syncing with no UI) would be a deliberate feature reversal — revisit this rule
  explicitly, don't reintroduce the session guard by accident.
- `idleMs` (default 10 s, env `LIQUID_FLOW_DAEMON_IDLE_MS`) balances two things:
  long enough to bridge an app restart / brief MCP reconnect, short enough to not
  linger. If MCP hosts that kill the server between calls become common, an open
  CLI/desktop acts as the stable anchor client (documented behavior) rather than
  lengthening this window.
- The `daemon.pid` file gives a cheap "is a daemon running?" check
  (`cat "$HOME/Library/Application Support/LiquidFlow/daemon.pid"`) without a
  status command — useful for support/debugging.
- `ELECTRON_RUN_AS_NODE=1` is inherited only by the spawned daemon; it does not
  affect the Electron app itself.
