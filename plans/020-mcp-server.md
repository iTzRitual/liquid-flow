# Plan 020: Add an MCP server (`@liquidflow/mcp`) so AI agents can drive Liquid Flow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 2a0d9d2..HEAD -- packages/core/src/controller.js packages/core/src/syncEngine.js packages/core/src/log.js vitest.config.js package.json CLAUDE.md`
> If any of these changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (new workspace + new external dependency; zero changes to existing runtime code)
- **Depends on**: none
- **Category**: direction (realizes deferred finding DIR-03 "headless/scriptable surface" — see `plans/README.md`)
- **Planned at**: commit `2a0d9d2`, 2026-07-02 (root version 0.9.137)

## Why this matters

Liquid Flow's core (`@liquidflow/core`) is deliberately UI-agnostic: the
`Controller` holds all state and both existing apps (Electron desktop, Ink CLI)
are thin "skins" over it. An MCP (Model Context Protocol) server is a third
skin that lets **AI agents** (Claude Code, Claude Desktop, any MCP client)
operate the tool: connect to a saved shop, pick a template, see and resolve
conflicts, read the live sync log, and — the key flow — **edit template files
directly on disk** in the synced working folder, letting the existing file
watcher hot-reload every change to the Comarch e-Sklep server. The agent gets
the same "edit locally, changes fly to the shop" loop a human gets, plus
programmatic access to conflicts and git checkpoints. No core changes are
needed; this is purely additive.

## Design decisions (already made — do not re-litigate)

1. **New workspace `apps/mcp`** (`@liquidflow/mcp`), bin `liquidflow-mcp`,
   mirroring `apps/cli`'s layout (`bin/` + `src/`). Plain ESM JS — no JSX, no
   tsx, no build step.
2. **stdio transport only.** The server is spawned by the MCP host (e.g. an
   entry in an agent's MCP config). No HTTP transport in this plan.
3. **No passwords over MCP.** `connect_shop` only works for shops saved with
   a stored password (`Controller.signInSaved`). Adding a new shop, or
   unlocking a password-protected template, stays in the CLI/desktop. This is
   a security boundary: agents never see or transmit shop credentials.
4. **Tool descriptions and tool results are English-only and do NOT go
   through `translations.js`.** They are an API contract consumed by AI
   agents, not UI text — the same documented exception as `git.js`'s
   technical strings. Error messages thrown by the core arrive already
   translated (current config language) and are passed through as-is. **No
   new i18n keys are needed.** (Step 7 records this exception in CLAUDE.md.)
5. **Tool results are JSON serialized into a single text content block**
   (`JSON.stringify(result, null, 2)`). No `structuredContent`/`outputSchema`
   in v1 — keeps the surface minimal and SDK-version-tolerant.
6. **Deferred (out of this plan):** git push/pull/branch/clone tools, HTTP
   transport, multi-session support, `unlock_template`. Record them as
   follow-ups in the plan's maintenance notes, do not build them.

## Current state

Relevant files (read them before coding):

- `packages/core/index.js` — public barrel: `Controller`, `SyncSession`,
  `MismatchType`, `store`, `log`, `diffSummary`, etc.
- `packages/core/src/controller.js` — the entire API the MCP server wraps
  (excerpts below).
- `packages/core/src/syncEngine.js` — `SyncSession.command(comm, file, type)`
  verbs (line ~428): `refresh`, `download`, `upload`, `removeLocal`,
  `removeRemote`, `downloadAll`, `uploadAll`; `previewConflict(file, type)`
  (line ~521) returns `{kind:'binary'|'tooLarge'|'text', local?, remote?, diff?}`.
- `packages/core/src/log.js` — channel-based log buffer;
  `since(lastId)` returns entries `{Id, TS, Text, Color, kind?, historic?}`.
- `apps/cli/bin/liquidflow.js` + `apps/cli/package.json` — the workspace
  pattern to copy (bin file, `"type":"module"`, `@liquidflow/core: "*"`).
- `vitest.config.js` — test `include` globs (must gain `apps/mcp/**`).
- `test/helpers/mockSoapServer.js` — local HTTP server faking the Comarch
  SOAP endpoint; `test/setup/tmpHome.js` — per-test-file `LIQUID_FLOW_HOME`.
- `packages/core/src/controller.session.test.js` — **the exemplar test**: it
  seeds a saved shop pointing at the mock SOAP server and drives
  `signInSaved → selectTemplate → session` end-to-end. Copy its handler set.

Controller API surface the tools call (verbatim signatures from
`packages/core/src/controller.js` @ `2a0d9d2`):

```js
// controller.js:84   getState() → { currentShop, currentTemplate, language, insecureTLS, logWrap, headerMode }
// controller.js:128  listShops() → [{ Id, Name, Url, Login, SavePassword, isCurrent }]
// controller.js:172  async signInSaved(id) → shopPublic; throws t.ShopNotFound / t.NoSavedPassword / t.InvalidLoginOrPassword
// controller.js:203  logout() → getState()
// controller.js:239  async listTemplates() → [{ Id, Name, Locked, HasPassword }]
// controller.js:249  async selectTemplate(tplId) → { Id, Name, Locked }   // starts SyncSession + watcher if !Locked
// controller.js:347  getMismatches() → [{ File:{Mode,Name}, Type, FileTs?, RemoteTs?, ... }]
// controller.js:353  async recheckMismatches() → fresh mismatches (same query as background poll)
// controller.js:358  async runCommand({ comm, file, type }) → mismatches; throws t.NoActiveSyncSession
// controller.js:365  async previewConflict(file, type) → { kind, local?, remote?, diff? } | null
// controller.js:370  getLog(sinceId = 0) → log entries since Id
// controller.js:432  async gitStatus() → { available, active, dir?, autoCommit?, autoPush?, branch?, ahead?, ... }
// controller.js:497  async gitHistory(limit = 100) → commit list
// controller.js:536  async gitCheckpoint(message, target?) → gitStatus()
// controller.js:760  currentFolder() → template dir path | null
// controller.js:775  dispose()
```

Facts that shape the implementation:

- **The core never writes to stdout** (`grep -rn "console\." packages/core/src`
  → no hits). This matters because the stdio transport owns stdout: any stray
  `console.log` in the server process corrupts the protocol stream. The MCP
  server itself must log only to `stderr` (or not at all).
- `MismatchType` = `'Timestamp' | 'LocalMissing' | 'RemoteMissing'`
  (`syncEngine.js:26`). `command('upload', file, type)` uses `type` to choose
  SOAP `FileSet` (Timestamp) vs `FileIsValid`+`FileAdd` (RemoteMissing) — so
  `resolve_conflict` must look up the mismatch's `Type` and pass it through.
- Data dir is controlled by `LIQUID_FLOW_HOME`; the MCP server shares the
  same config (and therefore the same saved shops) as the CLI.
- The repo convention for tests: files live **next to sources** as
  `*.test.js`, Vitest only (`npm test`); `test/setup/tmpHome.js` is a global
  setupFile so every test file automatically gets an isolated tmp home.
- Root `package.json` `workspaces` is `["packages/*", "apps/*"]` — a new
  `apps/mcp` folder is picked up automatically; only `npm install` is needed.

### MCP SDK facts (verified against official docs on 2026-07-02)

The TypeScript SDK is now split into two packages (the old unified
`@modelcontextprotocol/sdk` is the v1.x line):

- **`@modelcontextprotocol/server`** — server + `StdioServerTransport`
- **`@modelcontextprotocol/client`** — client + `InMemoryTransport` (tests only)
- Schemas use **zod v4** (`import * as z from 'zod/v4'` — the `zod` package
  ≥ 3.25 ships the `/v4` subpath; installing `zod@^4` and importing plain
  `'zod'` also works).

Verbatim server shape from the SDK README:

```js
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const server = new McpServer({ name: 'liquid-flow', version: '<pkg version>' });

server.registerTool(
  'greet',
  { description: 'Greet someone by name', inputSchema: z.object({ name: z.string() }) },
  async ({ name }) => ({ content: [{ type: 'text', text: `Hello, ${name}!` }] })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Error results: return `{ content: [{ type: 'text', text: <message> }], isError: true }`.

Verbatim in-process test shape from the SDK testing docs:

```js
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'test-harness', version: '1.0.0' });
await client.connect(clientTransport);
const result = await client.callTool({ name: 'list_shops', arguments: {} });
// result.content[0].text, result.isError
await client.close();
```

> **Fallback if these packages don't exist on the registry** (STOP condition
> escape hatch, use only after the primary install fails): the v1 line is
> `@modelcontextprotocol/sdk@^1` with deep imports
> `@modelcontextprotocol/sdk/server/mcp.js` (`McpServer`),
> `@modelcontextprotocol/sdk/server/stdio.js` (`StdioServerTransport`),
> `@modelcontextprotocol/sdk/client/index.js` (`Client`),
> `@modelcontextprotocol/sdk/inMemory.js` (`InMemoryTransport`), zod v3, and
> `registerTool`'s `inputSchema` takes a **raw zod shape**
> (`{ name: z.string() }`, no `z.object()` wrapper). Everything else in this
> plan is identical. If you use the fallback, say so in your report.

## Commands you will need

| Purpose        | Command                                              | Expected on success |
|----------------|------------------------------------------------------|---------------------|
| Install        | `npm install`                                        | exit 0              |
| Tests (gate)   | `npm test`                                           | exit 0, 100% green  |
| One test file  | `npx vitest run apps/mcp/src/server.test.js`         | all pass            |
| Manual smoke   | `node apps/mcp/bin/liquidflow-mcp.js` then type `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}` + Enter | one-line JSON-RPC result on stdout, nothing else |

There is no lint/typecheck script in this repo — `npm test` is the gate.

## Scope

**In scope** (the only files you create or modify):

- `apps/mcp/package.json` (create)
- `apps/mcp/bin/liquidflow-mcp.js` (create)
- `apps/mcp/src/server.js` (create)
- `apps/mcp/src/server.test.js` (create)
- `vitest.config.js` (add one include glob)
- `CLAUDE.md` (document the new workspace + the i18n exception)
- `README.md` (short section on running the MCP server)
- `package.json` (root), `apps/cli/package.json`, `packages/core/package.json`,
  `CHANGELOG.md` — **only** the mandatory version bump + changelog entry at
  commit time (repo rule), plus the version field in `apps/mcp/package.json`
  kept equal to the other three.
- `package-lock.json` — regenerated by `npm install` (expected side effect).

**Out of scope** (do NOT touch, even though they look related):

- `packages/core/**` — no core changes are needed; if you believe one is,
  that's a STOP condition.
- `apps/cli/**`, `apps/desktop/**` (except the version field in
  `apps/cli/package.json` per the bump rule).
- The SOAP protocol layer and its constants (protected contract per CLAUDE.md).
- Any git-mutation tools beyond `git_checkpoint` (push/pull/branches/clone —
  deferred).

## Git workflow

- Work directly on `main` (repo convention) unless the operator put you in a
  worktree.
- Before committing: bump the patch version **in all four** `package.json`
  files (root, `apps/cli`, `packages/core`, `apps/mcp` — read the current
  version from root, e.g. `0.9.137` → `0.9.138`), add a `CHANGELOG.md` section
  on top (`### Added` — one or two English sentences), and run `npm test`
  (must be 100% green).
- Commit message: Conventional Commits, English, **no Co-Authored-By footer**.
  Suggested: `feat(mcp): add MCP server exposing sync/conflicts/log/git to AI agents`
- Push: `git push origin main` (repo convention) unless the operator said otherwise.

## Steps

### Step 1: Scaffold the workspace

Create `apps/mcp/package.json`:

```json
{
  "name": "@liquidflow/mcp",
  "version": "<same as root package.json>",
  "description": "Liquid Flow — serwer MCP (Model Context Protocol) dla agentów AI",
  "type": "module",
  "license": "MIT",
  "bin": {
    "liquidflow-mcp": "bin/liquidflow-mcp.js"
  },
  "scripts": {
    "start": "node bin/liquidflow-mcp.js"
  },
  "dependencies": {
    "@liquidflow/core": "*",
    "@modelcontextprotocol/server": "^1",
    "zod": "^4"
  },
  "devDependencies": {
    "@modelcontextprotocol/client": "^1"
  }
}
```

Then run `npm install` from the repo root.

**Verify**: `npm install` → exit 0, and
`node -e "import('@modelcontextprotocol/server').then(m => console.log(typeof m.McpServer))"`
→ prints `function`. If the install cannot resolve these packages, apply the
v1-SDK fallback from "Current state" (swap the dependency for
`@modelcontextprotocol/sdk@^1` + `zod@^3` and use the deep-import paths /
raw-shape `inputSchema` everywhere below); report the substitution.

### Step 2: Implement `apps/mcp/src/server.js`

One exported factory — **no top-level side effects** (tests import it):

```js
export function buildServer(ctrl) { ... return server; }
```

`ctrl` is a `Controller` instance from `@liquidflow/core`. Inside, create
`new McpServer({ name: 'liquid-flow', version })` (read `version` from this
workspace's own `package.json` via
`JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version`
— same pattern as `controller.js:26`).

Add two local helpers and route every tool through them:

```js
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const wrap = (fn) => async (args) => {
  try { return ok(await fn(args)); }
  catch (e) { return { content: [{ type: 'text', text: String(e && e.message || e) }], isError: true }; }
};
```

Register exactly these 13 tools (name → zod input schema → behavior). Write
each `description` prescriptively — say *when* an agent should call it, not
only what it does. Comments in the file are in Polish (repo convention);
descriptions are English (design decision 4).

| Tool | Input schema | Behavior (Controller calls) |
|---|---|---|
| `status` | `z.object({})` | `ctrl.getState()` + `conflicts: ctrl.getMismatches().length` + (`await ctrl.gitStatus()` reduced to `{active, branch, ahead, dirty}` when `active`). One JSON object. |
| `list_shops` | `{}` | `ctrl.listShops()`. |
| `connect_shop` | `z.object({ shopId: z.number() })` | `await ctrl.signInSaved(shopId)`. Description must state it only works for shops saved with a stored password, and that new shops are added via the Liquid Flow CLI/desktop. |
| `disconnect` | `{}` | `ctrl.logout()`. |
| `list_templates` | `{}` | `await ctrl.listTemplates()`. |
| `select_template` | `z.object({ templateId: z.number() })` | `const r = await ctrl.selectTemplate(templateId)`; if `r.Locked` → **throw** `new Error('Template is locked; unlock it once in the Liquid Flow CLI or desktop app first.')`. Otherwise return `r` plus `workspace: ctrl.currentFolder()`. Description: this starts the sync session — the initial download may take a while. |
| `get_workspace_info` | `{}` | If no session → throw `NoActiveSyncSession` behavior (call `ctrl.runCommand` — no; simply `if (!ctrl.state.session) throw new Error('No active sync session — call select_template first.')`). Else return `{ templateDir: ctrl.currentFolder(), editDir: <templateDir>/0, note: 'Edit files under editDir with your own file tools; every save is hot-reloaded to the shop automatically. Paths containing a dot-segment (.git, .DS_Store) are ignored. Check get_logs afterwards to confirm the upload.' }`. `editDir`: use `store.templateModeDir(shopName, tplId, 0)` from `@liquidflow/core` (`ctrl.state.session.shopName`, `ctrl.state.session.templateId`) — same call as `controller.js:320`. |
| `list_conflicts` | `{}` | `await ctrl.recheckMismatches()` (live recheck, same as CLI `/conflicts`); map each to `{ name: m.File.Name, mode: m.File.Mode, type: m.Type, localTs: m.FileTs ?? null, remoteTs: m.RemoteTs ?? null }`. |
| `resolve_conflict` | `z.object({ command: z.enum(['download','upload','removeLocal','removeRemote','downloadAll','uploadAll']), name: z.string().optional(), mode: z.number().optional() })` | For the four per-file commands `name` is required (throw if missing); find the mismatch via `ctrl.getMismatches().find(m => m.File.Name === name && (mode === undefined || m.File.Mode === mode))` — throw `'No such conflict'` if absent — then `await ctrl.runCommand({ comm: command, file: m.File, type: m.Type })`. For `downloadAll`/`uploadAll` call `ctrl.runCommand({ comm: command })`. Return the refreshed mismatch list (mapped as in `list_conflicts`). Description must warn that `removeLocal`/`removeRemote` delete files and `downloadAll`/`uploadAll` overwrite every conflicted file on one side. |
| `preview_conflict` | `z.object({ name: z.string(), mode: z.number().optional() })` | Locate the mismatch as above; `const p = await ctrl.previewConflict(m.File, m.Type)`. Return `{ kind: p.kind }` plus, when `kind === 'text'`: `summary: diffSummary(p.diff)` (import from `@liquidflow/core`) and `local`/`remote` each truncated to 20 000 chars with a `truncated: true` flag when cut. For `binary`/`tooLarge` return just `{ kind, side? }`. |
| `get_logs` | `z.object({ sinceId: z.number().optional() })` | `ctrl.getLog(sinceId ?? 0)` mapped to `{ id: e.Id, ts: e.TS, text: e.Text }` (drop colors/kind), capped to the **last 200** entries; also return `lastId` (max Id, or `sinceId ?? 0` when empty) so agents can poll incrementally. |
| `git_status` | `{}` | `await ctrl.gitStatus()`. |
| `git_history` | `z.object({ limit: z.number().optional() })` | `await ctrl.gitHistory(limit ?? 20)`. |
| `git_checkpoint` | `z.object({ message: z.string() })` | `await ctrl.gitCheckpoint(message)`. Description: squashes the auto-commit work-in-progress into one named version on the target branch. |

(That's 14 rows including `status` — register them all.)

**Verify**: `node -e "import('./apps/mcp/src/server.js').then(m => console.log(typeof m.buildServer))"`
→ prints `function` (module loads with no side effects, no output on stdout).

### Step 3: Implement `apps/mcp/bin/liquidflow-mcp.js`

```js
#!/usr/bin/env node
// Punkt wejścia serwera MCP `liquidflow-mcp` (transport stdio).
// UWAGA: stdout należy do protokołu MCP — żadnych console.log.
import { Controller } from '@liquidflow/core';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { buildServer } from '../src/server.js';

const ctrl = new Controller();
const server = buildServer(ctrl);

const shutdown = () => { try { ctrl.dispose(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Make it executable-consistent with the CLI bin (`git update-index --chmod=+x`
is not needed — npm handles bin shebangs; just match `apps/cli/bin/liquidflow.js`).

**Verify**: run the manual smoke command from "Commands you will need". The
`initialize` request must get a single-line JSON-RPC response on stdout and
**no other stdout bytes** (log lines, banners). Ctrl+C exits cleanly.

### Step 4: Tests — `apps/mcp/src/server.test.js`

Model the setup after `packages/core/src/controller.session.test.js` (copy its
mock-SOAP handler set and config seeding verbatim — `TEMPLATE_XML`, `FILE`,
`META`, `startMockSoap`, `store.saveConfig`, unique shop name per test run,
`beforeEach` clearing `store.paths.CONFIG_PATH` + `logbuf.setActiveChannel('app')`,
`afterEach` with `ctrl.dispose()` + `srv.close()`). Import helpers relative to
the new file: `../../../test/helpers/mockSoapServer.js`.

Wire the MCP client in-process:

```js
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
// w każdym teście:
const [ct, st] = InMemoryTransport.createLinkedPair();
await buildServer(ctrl).connect(st);
const client = new Client({ name: 'test', version: '0' });
await client.connect(ct);
// ... await client.callTool({ name, arguments })
// afterEach: await client.close()
```

Add a tiny local helper `const parse = (r) => JSON.parse(r.content[0].text);`.

Cases to cover (one `it` each, ~8 tests):

1. `list_shops` returns the seeded shop; `status` shows `currentShop: null`
   before connecting.
2. `connect_shop` → `status.currentShop.Name` matches; `connect_shop` with an
   unknown id → `result.isError === true` and message text present.
3. `list_templates` returns the mocked template `{Id: 5, Name: 'Topaz'}`.
4. `select_template` downloads files (assert
   `fs.readFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'utf8') === 'WITAJ'`)
   and returns `workspace`.
5. `get_workspace_info` after select returns an `editDir` ending in
   `/files/5/0`; before any session → `isError: true`.
6. Conflict round-trip: after select, override the `Liquid_FilesMetaGet`
   handler (pass `handlers` with a **newer** remote date, as the exemplar's
   conflict tests do) → `list_conflicts` returns one `Timestamp` entry →
   `resolve_conflict {command:'download', name:'index.liquid'}` → returned
   list is empty and the local file has the remote content.
7. `resolve_conflict` with a per-file command and no `name` → `isError: true`;
   with a name that isn't conflicted → `isError: true`.
8. `get_logs` returns entries with increasing ids and a `lastId`; calling
   again with `sinceId: lastId` returns only newer (or zero) entries.

Note on the byte-identical auto-suppress (see plan 019 / Run 4b in
`plans/README.md`): `refreshMismatches` drops Timestamp conflicts whose
content is identical — so in test 6 the overridden `Liquid_FilesGet` for the
conflicted state must return **different content** than the local file (e.g.
`content: 'NOWA'`), otherwise the conflict self-heals and the test is vacuous.

**Verify**: `npx vitest run apps/mcp/src/server.test.js` → all pass. (It will
only be collected after Step 5; until then run it via the explicit path,
which vitest accepts regardless of `include`.)

### Step 5: Register the workspace in Vitest

In `vitest.config.js`, add to `include`:

```js
'apps/mcp/**/*.test.js',
```

**Verify**: `npm test` → exit 0, all green, and the summary lists
`apps/mcp/src/server.test.js`.

### Step 6: Documentation — `README.md`

Add a short section (match the README's existing language/tone) describing:
what the MCP server is for, how to run it
(`node apps/mcp/bin/liquidflow-mcp.js` or `liquidflow-mcp` after `npm link`),
a sample MCP host config snippet
(`{"command": "node", "args": ["<repo>/apps/mcp/bin/liquidflow-mcp.js"]}`),
and the security note (saved-password shops only; no credentials over MCP).

**Verify**: `git diff README.md` shows only the new section.

### Step 7: Documentation — `CLAUDE.md`

Three surgical edits (keep the file's Polish):

1. In the architecture tree (section "Architektura"), add a line for
   `apps/mcp/  @liquidflow/mcp — serwer MCP dla agentów AI (bin/liquidflow-mcp.js + src/server.js)`.
2. In the i18n section, extend the `git.js` exception sentence to also cover
   the MCP layer: tool descriptions/results are an English API contract for
   agents, not UI — no PL/EN keys.
3. In the versioning rule, change "we **wszystkich trzech** plikach" to four
   files, adding `apps/mcp/package.json` to the list.

**Verify**: `grep -n "liquidflow-mcp\|apps/mcp" CLAUDE.md` → ≥ 2 hits.

### Step 8: Gate, version bump, changelog, commit

Follow the "Git workflow" section above: bump 4 × `package.json`, add the
`CHANGELOG.md` entry, `npm test` green, commit, push.

**Verify**: `npm test` → exit 0; `git status` → clean; version identical in
all four `package.json` files.

## Test plan

Summarized from Step 4: eight in-process tests in
`apps/mcp/src/server.test.js`, driving the real `Controller` against the real
mock SOAP socket through the real MCP wire format (`InMemoryTransport`),
covering: happy paths (shops → connect → templates → select → workspace →
logs), the conflict lifecycle (detect → resolve → verify file bytes), and the
error contract (`isError: true` for unknown shop, missing session, missing
`name`, unknown conflict). Structural pattern:
`packages/core/src/controller.session.test.js`. Verification:
`npm test` → exit 0 with the new file collected and green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0 (100% green) and collects `apps/mcp/src/server.test.js`
- [ ] `node -e "import('./apps/mcp/src/server.js').then(m=>console.log(typeof m.buildServer))"` prints `function`
- [ ] Manual smoke (Step 3 verify): `initialize` over stdio answers on stdout with nothing but JSON-RPC
- [ ] `grep -rn "console\.log" apps/mcp/` returns no matches
- [ ] `git diff --name-only <base>` touches only the in-scope list (plus `package-lock.json`)
- [ ] Version field identical in root, `apps/cli`, `packages/core`, `apps/mcp` `package.json`; `CHANGELOG.md` has the new top section
- [ ] `plans/README.md` status row for 020 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Neither `@modelcontextprotocol/server`/`@modelcontextprotocol/client` **nor**
  the fallback `@modelcontextprotocol/sdk@^1` can be installed, or the
  installed package's API matches neither shape documented in "Current state"
  (e.g. `registerTool` is absent). Do not hand-roll the JSON-RPC protocol.
- Implementing any tool seems to require modifying `packages/core/**`.
- A Controller signature you need diverges from the excerpts (drift since
  `2a0d9d2`).
- The stdio smoke test shows extra bytes on stdout that you cannot attribute
  to your own code (would mean a core dependency prints — needs a human
  decision, not a workaround).
- `npm test` regressions appear in files you did not touch.

## Maintenance notes

- **Follow-ups deliberately deferred**: git push/pull/branch/clone tools
  (fold in once plan 009's clone-bootstrap entry point exists), an
  `unlock_template` tool (needs a password-over-MCP policy decision), HTTP
  transport, MCP resources (exposing the log as a subscribable resource
  instead of polled `get_logs`), and prompt templates.
- **Reviewer should scrutinize**: stdout purity (the #1 way to break an MCP
  stdio server), that `resolve_conflict` passes the mismatch `Type` through
  to `runCommand` (upload chooses SOAP `FileSet` vs `FileAdd` on it), and
  that no tool leaks `shop.Password`/decrypted secrets into results
  (`shopPublic`/`listShops` are already safe — keep it that way).
- **Interactions**: anyone changing `Controller`'s public API must now update
  three skins (desktop IPC bridge, CLI `useController`, MCP `server.js`).
  The version-bump rule now spans four `package.json` files.
- The MCP server holds one `Controller` (one session at a time) — same
  constraint as the CLI. If DIR-05 (multi-session) ever lands, the tool
  surface needs a `session` discriminator.
