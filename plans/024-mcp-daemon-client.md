# Plan 024: Migrate the MCP server onto the shared daemon

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done (unless a
> reviewer maintains the index).
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA of 022 merge>..HEAD -- apps/mcp/bin/liquidflow-mcp.js apps/mcp/src/server.js apps/mcp/src/server.test.js`
> Compare "Current state" excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (`server.js` reads `ctrl.state.session` directly and calls
  several **synchronous** Controller accessors that become async on the client)
- **Depends on**: plan 022 (DONE). Independent of plan 023 (order doesn't matter).
- **Category**: architecture / migration
- **Planned at**: fill with `git rev-parse --short HEAD` when 022 is merged.

## Why this matters

The MCP server is how AI agents drive Liquid Flow. Today it spins up its **own**
`Controller` (`apps/mcp/bin/liquidflow-mcp.js:8`), so an agent's sync session is
invisible to a CLI or desktop the user has open — the exact opposite of the
user's goal ("do the job through MCP, watch it in the CLI at the same time").
After this plan the MCP server attaches to the **same daemon** as the CLI and
desktop, so every `select_template`, `resolve_conflict`, and hot-reload the
agent triggers streams live into whatever UI the user is watching, and there is
only ever **one** watcher on the folder.

## Current state

- **`apps/mcp/bin/liquidflow-mcp.js`** — 16 lines. Line 8:
  `const ctrl = new Controller();`. Lines 4-6 import `Controller`,
  `StdioServerTransport`, `buildServer`. Lines 11-13 `SIGINT/SIGTERM → ctrl.dispose()`.
  **Rule (from CLAUDE.md + the file header): stdout belongs to the MCP protocol
  — no `console.log` anywhere in `apps/mcp/`.**
- **`apps/mcp/src/server.js`** — `buildServer(ctrl)` registers 14 tools. Spots
  that use **synchronous** Controller behavior which becomes async on
  `DaemonClient`:
  - `status` (line 33): `ctrl.getMismatches().length` — sync mirror read on the
    client → **still works** (DaemonClient.getMismatches is sync). `ctrl.getState()`
    (line 34) — sync, **works**. `await ctrl.gitStatus()` — already async, works.
  - `get_workspace_info` (lines 136-149): reads **`ctrl.state.session`** and
    `ctrl.state.session.shopName` / `.templateId` **directly** — `DaemonClient`
    has no `.state.session`. Must be rewritten to use `getState()` +
    `store.templateModeDir(...)` computed client-side.
  - `select_template` (line 125): `ctrl.currentFolder()` — becomes async → `await`.
  - `resolve_conflict` / `preview_conflict` (lines 188, 217): `ctrl.getMismatches()`
    — sync mirror read, **works**. `ctrl.runCommand(...)`, `ctrl.recheckMismatches()`,
    `ctrl.previewConflict(...)` — already `await`ed, work.
  - `get_logs` (line 266): `ctrl.getLog(sinceId ?? 0)` — sync mirror read, works.
- **`apps/mcp/src/server.test.js`** — 8 integration tests using a **real
  Controller** + mock SOAP + `InMemoryTransport`. These construct
  `buildServer(realController)` directly, so they keep working against a real
  Controller (the client swap is only in the bin). Keep them green.
- **`DaemonClient` (plan 022)**: sync `getState()`, `getMismatches()`,
  `getLog(0)`; async everything else including `currentFolder()`,
  `currentShopUrl()`, `localFilePath()`. Emits the same events. `dispose()` only
  disconnects.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | exit 0, green, includes `apps/mcp/src/server.test.js` |
| stdio smoke | (see Step 3) | one JSON-RPC line on stdout, empty stderr |

## Scope

**In scope**:
- `apps/mcp/bin/liquidflow-mcp.js` (edit) — `new Controller()` → `await connectController()`.
- `apps/mcp/src/server.js` (edit) — remove direct `ctrl.state.session` access
  in `get_workspace_info`; `await` `currentFolder()` where needed. Keep tool
  descriptions/results **English** (API contract).
- Four `package.json` version bumps + `CHANGELOG.md`.

**Out of scope**:
- `packages/core/**` (daemon already built), `apps/cli/**`, `apps/desktop/**`.
- The set of 14 tools, their names, or their input schemas — behavior stays the
  same; only the plumbing under them changes.
- `apps/mcp/src/server.test.js` assertions — they run against a real Controller
  and must stay green **unchanged** (if a change is forced, that's a STOP —
  `buildServer` must remain compatible with a real Controller so those tests and
  the daemon both work).

## Git workflow

- Branch: `advisor/024-mcp-daemon-client`.
- Conventional Commits, English, no `Co-Authored-By`. Example:
  `refactor(mcp): attach to shared daemon so agent sync is visible in CLI/desktop`.
- Bump all four `package.json` + `CHANGELOG.md`.

## Steps

### Step 1: Swap the bin to `connectController`

Edit `apps/mcp/bin/liquidflow-mcp.js`:

```js
#!/usr/bin/env node
// Punkt wejścia serwera MCP `liquidflow-mcp` (transport stdio).
// UWAGA: stdout należy do protokołu MCP — żadnych console.log.
import { connectController } from '@liquidflow/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '../src/server.js';

const ctrl = await connectController({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
const server = buildServer(ctrl);

const shutdown = () => { try { ctrl.dispose(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
```

`ctrl` is now a `DaemonClient`. `ctrl.dispose()` disconnects from the daemon
(does not stop other clients' sessions). **Do not** add any stdout writes; the
daemon spawns silently (`spawnDaemon` uses `stdio:'ignore'`), so nothing leaks
onto the MCP stdout.

**Verify**: `grep -n "new Controller" apps/mcp/bin/liquidflow-mcp.js` → none.

### Step 2: Rewrite `get_workspace_info` to avoid `ctrl.state.session`

`DaemonClient` has no `.state`. Replace the `get_workspace_info` handler body
(server.js ~136-149) to derive everything from `getState()` + the client's async
helpers. Target shape:

```js
wrap(async () => {
  const st = ctrl.getState();
  if (!st || !st.currentTemplate || !st.currentShop) {
    throw new Error('No active sync session — call select_template first.');
  }
  const templateDir = await ctrl.currentFolder();
  // editDir = tryb roboczy '0'; policz lokalnie przez store (czysta ścieżka)
  const editDir = store.templateModeDir(st.currentShop.Name, st.currentTemplate.Id, 0);
  return {
    templateDir,
    editDir,
    note: 'Edit files under editDir with your own file tools; every save is hot-reloaded to the shop automatically. Paths containing a dot-segment (.git, .DS_Store) are ignored. Check get_logs afterwards to confirm the upload.'
  };
})
```

`store` is already imported at the top of `server.js`
(`import { store, diffSummary } from '@liquidflow/core'`). `getState()` returns
`currentShop` (with `.Name`) and `currentTemplate` (with `.Id`), so this needs
no session object.

**Important compatibility note**: `buildServer` is also called with a **real
Controller** in `server.test.js`. A real `Controller.getState()` also returns
`currentShop`/`currentTemplate`, and `Controller.currentFolder()` is sync but
returns the same value when `await`ed (awaiting a non-Promise is fine). So this
rewrite works for **both** a real Controller and a DaemonClient — keeping the
existing tests green.

**Verify**: `grep -n "ctrl.state" apps/mcp/src/server.js` → no matches.

### Step 3: `await` `currentFolder()` in `select_template`

In the `select_template` handler (server.js ~125), change
`workspace: ctrl.currentFolder()` to `workspace: await ctrl.currentFolder()`.
(Awaiting the sync value from a real Controller is harmless; required for the
client.)

**Verify** (stdio smoke — must show exactly one JSON-RPC line, empty stderr):

```
LIQUID_FLOW_HOME=$(mktemp -d) node -e '
const { spawn } = require("node:child_process");
const p = spawn(process.execPath, ["apps/mcp/bin/liquidflow-mcp.js"], { stdio:["pipe","pipe","pipe"] });
let out=""; let err="";
p.stdout.on("data",d=>out+=d); p.stderr.on("data",d=>err+=d);
p.stdin.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"t",version:"0"}}})+"\n");
setTimeout(()=>{ console.error("STDERR:",JSON.stringify(err)); console.error("STDOUT_LINES:", out.trim().split("\n").length); p.kill(); }, 1500);
'
```
→ `STDERR: ""` and `STDOUT_LINES: 1` (only protocol on stdout).

### Step 4: Version bump + CHANGELOG + gate

Bump all four `package.json`; add a `CHANGELOG.md` `### Changed` entry ("MCP
server attaches to the shared daemon; agent-driven sync is now visible in the
CLI/desktop and shares one watcher"). Run the gate.

**Verify**: `npm test` exit 0, green, `apps/mcp/src/server.test.js` still passes
unchanged.

## Test plan

- `apps/mcp/src/server.test.js` (existing, 8 tests) is the regression guard: it
  builds `buildServer(realController)` and must pass **unchanged**, proving the
  `get_workspace_info` rewrite stays compatible with a real Controller.
- stdio purity smoke (Step 3) proves the daemon spawn doesn't pollute MCP stdout.
- Manual: with a shop saved (password stored), start the MCP server via Claude
  Desktop, `connect_shop` + `select_template`, and confirm an open CLI shows the
  same session/logs live. Note result in NOTES.

## Done criteria

- [ ] `grep -n "new Controller" apps/mcp/bin/liquidflow-mcp.js` → none.
- [ ] `grep -n "ctrl.state" apps/mcp/src/server.js` → none.
- [ ] `npm test` exit 0; `apps/mcp/src/server.test.js` passes unchanged.
- [ ] stdio smoke: exactly one JSON-RPC line on stdout, empty stderr.
- [ ] Four `package.json` bumped; `CHANGELOG.md` updated.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` row updated.

## STOP conditions

- `connectController` not exported from `@liquidflow/core` → 022 not merged; STOP.
- `server.test.js` requires assertion changes to pass → the `get_workspace_info`
  rewrite broke real-Controller compatibility; rework it (must support both),
  don't weaken the test.
- Any stdout output appears during the stdio smoke besides JSON-RPC → the daemon
  spawn is leaking to stdout; report (fix belongs in `spawnDaemon`'s
  `stdio:'ignore'`, plan 022 territory).

## Maintenance notes

- `buildServer(ctrl)` must remain agnostic to whether `ctrl` is a real
  `Controller` or a `DaemonClient` — that duality is what keeps the in-process
  tests valid while production uses the daemon. Preserve it in future tool work.
- New MCP tools that need Controller data must use `getState()` /
  `getMismatches()` / `getLog()` (mirror-backed sync) or `await ctrl.call(...)`
  wrappers — never `ctrl.state.*`.
- Security posture is unchanged/better: `connect_shop` still only works for
  shops with a stored password, and passwords now live solely in the daemon
  process, not the MCP process.
