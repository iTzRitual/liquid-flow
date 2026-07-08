# CLAUDE.md

Guidance for future sessions working on this repository.

> Additional, more detailed guidance lives in `CLAUDE.md` files next to the
> code they cover — they load automatically when you work in that directory:
> `apps/cli/CLAUDE.md` (Ink/TUI — layout, scroll, colors, slash commands),
> `apps/desktop/CLAUDE.md` (redesign, Storybook, design MCP).

## Code-work principles (general)

General behavioral guidelines, independent of this repository — they reduce
common LLM coding mistakes. Priority: caution over speed; use judgment for
trivial tasks.

1. **Think before coding.** Don't assume, don't hide confusion, surface
   tradeoffs. Before implementing: state assumptions explicitly (if
   uncertain — ask); if several interpretations of the task exist, present
   them instead of silently picking one; if a simpler approach exists — say
   so and, if warranted, push back on the request; if something is unclear —
   stop, name exactly what, and ask.
2. **Simplicity first.** Minimum code that solves the problem, nothing
   speculative. No features beyond what was asked; no abstractions for
   one-off code; no "flexibility"/"configurability" nobody requested; no
   error handling for scenarios that can't happen. If you wrote 200 lines
   and 50 would do — rewrite it. Test: "Would a senior call this
   overcomplicated?" — if yes, simplify.
3. **Surgical changes.** Touch only what you must; clean up only your own
   mess. When editing existing code: don't "improve" adjacent code,
   comments, or formatting; don't refactor things that aren't broken; match
   the existing style even if you'd do it differently; if you notice
   unrelated dead code — mention it, don't remove it. When your changes
   create orphans (unused imports/variables/functions CREATED by your
   change) — remove them; don't remove dead code that predates your change
   unless asked. Test: every changed line should trace directly to the
   user's request.
4. **Goal-driven execution.** Define success criteria, iterate to
   verification. Translate tasks into verifiable goals ("add validation" →
   "write tests for invalid inputs, then make them pass"; "fix the bug" →
   "write a test that reproduces it, then make it pass"; "refactor X" →
   "make sure tests pass before and after"). For multi-step tasks, state a
   short plan (step → verification). Strong success criteria let you work
   independently; weak ones ("make it work") require constant clarification.

## What this project is

**Liquid Flow** — a tool for syncing and hot-reloading Liquid templates in
**Comarch e-Sklep** shops. You edit files locally, and changes go straight to
the shop server (SOAP). Three "skins" over a shared core, connected through
one shared daemon (see below):

- **Desktop** (Electron) — `apps/desktop`, React GUI, tray icon, builds to
  .dmg/.exe/.AppImage.
- **CLI** (`liquidflow`) — `apps/cli`, interactive TUI in Ink (React in the
  terminal).
- **MCP** (`liquidflow-mcp`) — `apps/mcp`, MCP server for AI agents.

> Branding: always **Liquid Flow** / `liquidflow`. Do not introduce
> references to the original tool or words like "clone/rip-off/reverse
> engineering". The logo is a placeholder (a square for desktop, an
> ASCII gradient for CLI).

## Architecture (monorepo, npm workspaces)

```
packages/core/   @liquidflow/core — all logic, UI-independent
  src/
    controller.js  state orchestration; EventEmitter (events below)
    soap.js        iSklep24Service.asmx SOAP client (+ session cookie)
    syncEngine.js  file watcher, hot-reload, conflict detection, progress
    store.js       config, metadata, paths, password encryption
    git.js         versioning/backup (wraps `git` commands)
    log.js         log buffer with channels/scope (EventEmitter 'entry'+'reset'); hex colors
    translations.js  pl/en (UI), xml.js (SOAP parser)
    daemon/        liquidflow-daemon: one Controller, many thin clients
      server.js      daemon process — holds the single `Controller`,
                      listens on a local unix socket/named pipe
      client.js      `connectController()` / `DaemonClient` — RPC to the
                      server, auto-spawns the daemon on first use
      protocol.js    RPC contract (method mapping, event broadcast)
  bin/liquidflow-daemon.js  daemon process entrypoint
  index.js         public barrel export
apps/desktop/    @liquidflow/desktop — electron/ (main.js, preload.cjs) + renderer/ (Vite+Tailwind+shadcn)
apps/cli/        @liquidflow/cli — bin/liquidflow.js + src/ (Ink)
apps/mcp/        @liquidflow/mcp — MCP server for AI agents (bin/liquidflow-mcp.js + src/server.js)
```

**Key pattern:** `core` never imports Electron or Ink/React. `Controller`
holds all the state and emits events.

**Shared daemon (`liquidflow-daemon`)**: all three apps connect to **one**
daemon process instead of building their own in-process `Controller` —
so a shop/template/password saved in one app is immediately visible in the
others, and two apps on the same template don't run duplicate watchers.
Each app calls `await connectController({ insecureTLS })` from
`@liquidflow/core` (`apps/cli/src/useController.js`,
`apps/mcp/bin/liquidflow-mcp.js`, `apps/desktop/electron/main.js`) — this
returns a `DaemonClient`, which auto-spawns `liquidflow-daemon` on first use
if it isn't already running, and connects over a local unix
socket/named pipe. The daemon exits on its own once the last client
disconnects (no orphaned processes). `LIQUID_FLOW_NO_DAEMON=1` forces the
old in-process behavior (no daemon) — useful for debugging in isolation.
All apps must point at the same data directory (`LIQUID_FLOW_HOME` /
`defaultAppDir()`), otherwise they'll get separate daemons and won't share
state.

`DaemonClient` exposes the same event interface as the local `Controller`
(transparent to the apps — they subscribe exactly as before the daemon
migration):

- `log` — a new log entry `{ Id, TS, Text, Color, kind?, historic?, msg?, params? }`
  (`msg`+`params` = i18n descriptor, `Text` rendered for the current language)
- `log:reset` — full buffer replacement after a channel switch **or a language change**
- `mismatches` — the conflict list
- `state` — `{ currentShop, currentTemplate, language, insecureTLS }`
- `git` — repo status (gitStatus)
- `progress` — sync-startup stages (`download`/`check`/`ready`)

Desktop bridges this over IPC (`electron/preload.cjs` → `window.api`,
`electron/main.js` → handlers, now sitting on top of `DaemonClient` instead
of a local `Controller`). CLI subscribes directly in
`apps/cli/src/useController.js`.

History of the daemon migration and design decisions: `plans/022`–`030`
(all `DONE`; `plans/README.md` has the full rationale and rollout order).

## Protocol (do NOT change)

The Comarch e-Sklep SOAP API is the shop's contract — these constants are
required for it to work: namespace `http://www.icomarch24.pl/iSklep24`,
endpoint `iSklep24Service.asmx`, `SOAPAction`, field order, the
`ISklep24Client` class. Limits: name ≤ 64 chars, file ≤ 519168 B, text-file
validation.

## Data layout and template modes

Data directory (overridable via `LIQUID_FLOW_HOME`; in Electron = userData):
- macOS `~/Library/Application Support/LiquidFlow/`, Win `%APPDATA%\LiquidFlow\`,
  Linux `~/.config/liquid-flow/`.
- Layout: `Shops/<Name>/files/<TemplateId>/<Mode>/<path>` + `meta/<id>.json`
  (timestamps for comparisons) + `config.json`.

**Modes (`Mode`)**: the `0` and `2` subfolders are **real sets of template
files on the server** (both downloaded, both watched, both synced). These
are NOT local mirrors — the local↔remote comparison lives in `meta/`, not in
the folder. You mostly work in `0`.

**Git**: the repo lives in the working folder `files/<id>/0` (not at the
template level). All dotted paths (`.git`, `.DS_Store`) are skipped by sync
(`store.parseLocalPath` returns `null`), so the inside of `.git` never
reaches e-Sklep. History is shared through the remote repo (GitHub), not
through Comarch. `git push` ≠ sending to the shop (that happens
automatically via the watcher).

## Logs — channels (scope) and persistent per-template history

`log.js` is no longer a single global buffer — it holds **channels** with
one **active** at a time (since only one sync session is ever active).
Producers call `logInfo/logOk/logErr` without knowing about the channel; the
entry lands in whichever one is current.

**Logs are i18n-aware (translated live).** A log function's argument is
EITHER a literal (a string — e.g. raw `e.message`, git stderr: stays as-is),
OR an **i18n descriptor** `tmsg(key, params)` → `{ msg, params }`. `log.js`
holds the current language and renders `Text` from the descriptor;
`log.setLanguage(lang)` (called by `Controller.setLanguage`) recomputes
`Text` for every entry that has a descriptor in the active channel and emits
`'reset'` → the entire visible log (and any loaded history) switches
language. The separator has a variant `separator({ key, ts })` (key + time;
the date is formatted per `localeFor`). **Rule: log producers never
concatenate translated strings — they pass `tmsg('Key', params)`**; literals
are only for untranslatable text (exceptions/stderr — those stay in the
language of the moment they occurred).

`Controller` switches channels (`logbuf.setActiveChannel(key, opts)`) at
lifecycle points:
- `app` — before connecting (ephemeral),
- `shop:<id>` — shop connected, no template (ephemeral),
- `tpl:<shopId>:<tplId>` — active template (**persistent**: `opts.persist`
  appends every live entry to a file, `opts.history` loads previous
  entries).

Switching channels emits `'reset'` (Controller → `'log:reset'`) with the
full buffer — the UI swaps the entire log (CLI: `useController` sets `log`
and bumps `logVersion`, and `App.jsx` scrolls to the bottom). Each channel
has its own `Id` sequence.

**Persistent per-template history**: `store.appendLogEntry` /
`store.readLogTail` (file `Shops/<Name>/logs/<tplId>.jsonl`,
JSON-per-line, trimmed to 1000 lines). Each line also stores the i18n
descriptor (`msg`/`params` or `sepKey`/`sepTs`) alongside `Text`, so on
reload the history renders in the current language (old files without a
descriptor → fall back to the stored `Text`). The file lives **outside**
`files/<id>/`, so it never reaches sync or the template's git repo. At
session start (`_startSession`) the Controller: loads the history tail
(entries get `historic:true` → dimmed in `LogPane`), appends
`logbuf.separator({ key:'NewSession', ts })` (`kind:'separator'`, rendered
as a divider line "── … ─────"), and only then does the new session start
streaming. `buildVlines` handles both fields: separator (color `#82bbff`,
full width) and `historic` (`dimColor`).

## Delegating subtasks to Gemini/Antigravity (MCP)

The session's primary model (Sonnet) can delegate individual subtasks to
Gemini via the MCP server **`gemini-mcp-tool`** (registered in `.mcp.json`,
`npx -y gemini-mcp-tool`). The server doesn't use an API key — under the
hood it runs a locally installed **Antigravity CLI (`agy`)**, the successor
to Gemini CLI (Google sunset Gemini CLI for free/AI Pro/AI Ultra accounts on
2026-06-18), logged in via OAuth on a Google account with an AI Pro/Ultra
subscription — it consumes that account's quota, with no separate API
billing. Requirement: `agy` must be installed and logged in locally (`agy
auth status`) — a one-time, interactive step the user has to do; it can't
be done from within an agent session.

Tools exposed through this MCP:
- `ask-gemini` — a prompt + optional file references (`@path`), for
  analyzing large sets of files/context beyond Sonnet's comfortable window.
- `sandbox-test` — running/testing a code snippet in an isolated Gemini
  sandbox (a one-off check, not code to paste in without review).

When to reach for it: searching/analyzing large sets of files or logs,
prototyping code for a quick check, research that needs a large context
window. This is NOT a replacement for `advisor()` (Opus/Fable) —
`advisor()` is a second opinion/review over Sonnet's line of work,
`ask-gemini`/`sandbox-test` is an executive tool for specific, delegated
subtasks; both mechanisms work independently and can be used in the same
session. Automating `agy` via CLI is subject to Google's rules for AI
Pro/Ultra accounts — this is not an official API channel, so high query
volume may hit account throttling.

## Translations (i18n) — PL/EN

The application is fully bilingual (Polish + English). One source of truth:
`packages/core/src/translations.js` — two **flat arrays** `pl` and `en`
(`en` is `{ ...pl, …overrides }`) plus the helpers `tfmt`, `translationsFor`,
`localeFor`, `LANGUAGES`, `LOCALES`. The array holds **strings only** (it's
serialized over IPC to desktop — no functions).

> **HARD RULE: every new user-visible text MUST have an entry in both
> arrays (`pl` and `en`).** Don't hardcode strings in `controller.js`,
> `syncEngine.js`, `soap.js`, `commands.js`, CLI components, or the desktop
> renderer — add a key to `translations.js` and use it. After adding one,
> verify parity (see below).

**Texts with a dynamic insert** use `{name}` tokens and are assembled by
`tfmt(str, params)` (e.g. `tfmt(t.ConnectedToShop, { name })`). In the
desktop renderer avoid tokens — assemble the value in JSX from separate
key-words (e.g. `{git.commitCount} {t.Versions}`), because the renderer
never calls `tfmt`.

How `t` (the array for the current language) reaches each layer:
- **core**: `Controller` has a `get t()` getter; `SyncSession`/
  `ISklep24Client` receive `language` in their options and keep their own
  `this.t` (for **thrown errors**, which render at the moment they're
  thrown). **Logs** travel as `tmsg('Key', params)` descriptors and
  translate live (see the "Logs" section). The language lives in
  `config.Language`; `setLanguage` saves the config, calls
  `logbuf.setLanguage` (re-renders the log → `log:reset`) and emits
  `state`. Git commit messages are rendered by `controller` through `tfmt`
  (that's repo data).
- **CLI**: `useController` exposes `t` (recomputed on the `state` event);
  `App.jsx` passes `t` to `ctx` (commands) and as a **prop** to EVERY
  component that renders text (`Header`→`StatusBar`, `Picker`, `Form`,
  `CommandPalette`, `LogPane`). Status labels (`Shop/Template/Git`) are
  aligned with padding computed from word length, so it works in both
  languages.
- **desktop**: `Controller.getTranslations()` → IPC → `App.jsx` (`t` in the
  `useApp()` context). Components read `t.Key`. The tray in
  `electron/main.js` gets `t` at startup.

The VCS layer (`git.js`) deliberately keeps **English** technical strings
(commit messages/plumbing errors are repo data, not UI); text visible in
history (e.g. a "restore" message) is passed in already translated by
`controller.js`. The MCP server's (`apps/mcp`) tool descriptions and results
are also in English, as an API contract.

**Verification after i18n changes** (run from the repo root):
- key parity + no "untranslated" entries (en === pl while the content has
  Polish characters):
  `node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;console.log('untranslated:',Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k])))})"`
- no hardcoded Polish text outside `translations.js` (scan for diacritics in
  strings/JSX; also remember words without diacritics like "lub/sklep/brak").
- render both languages: point `LIQUID_FLOW_HOME` at a fresh directory with
  `config.json` = `{"Language":"en","Shops":[]}` and render `App.jsx` to a
  fake stdout (as in `apps/cli/test/*`).

## Code conventions

- **ESM** everywhere (`"type":"module"`), Node 18+.
- **Language / i18n**: **all user-visible text** (UI, logs, errors, tray)
  goes through `translations.js` (`pl`/`en`) — zero hardcoded strings in
  presentation layers. Details and the hard rule "new text = both PL and EN
  entries" — see the "Translations (i18n) — PL/EN" section above. Code
  comments — see the rules below.
- **Code comments (MANDATORY)**: always **English only**, regardless of the
  fact that the rest of this documentation and the app's UI are in Polish.
  They must be **professional and descriptive** — explaining WHY a piece of
  code exists or what non-obvious nuance/constraint it represents, not WHAT
  the code does line by line (that's visible from the code itself).
  Forbidden: traces of the editing process or chat conversation — no
  "removed X", "changed per user request", "fixed as requested", "TODO:
  revisit after discussion", etc. A comment should be just as current and
  unbiased as if someone wrote it from scratch, looking only at the final
  code.
- **Style**: match the surrounding code; concise functions; no unnecessary
  dependencies (e.g. the spinner/window are hand-rolled, not from packages).
- **Commits**: Conventional Commits in English (`feat(cli): …`,
  `fix(git): …`, `style(cli): …`). **No** "Co-Authored-By" footer.
  **Workflow**: after every prompt/task — commit + `git push origin main`.
  Message: change type (feat/fix/style/etc.) + a short one-line summary of
  what changed. We work directly on `main`. Remote:
  `git@github.com:iTzRitual/comarch-liquid-sync-2026.git`.
- **Versioning (MANDATORY on every commit)**: before every commit, bump the
  patch number in `version` by 1 in **all four** files at once:
  `package.json` (root), `apps/cli/package.json`,
  `packages/core/package.json`, `apps/mcp/package.json`. Read the current
  version from any one of these files (they're always kept in sync).
  Example: `0.9.91` → `0.9.92`. Bump minor (`0.X.0`) only for major
  milestones (a new feature of substantial scope). **Never commit without
  bumping the version.**
- **Parallel-worktree hygiene (MANDATORY with multiple executors)**: when
  several plans/executors work simultaneously in separate **git worktrees**
  (e.g. parallel migrations 023/024/025), before merging you must **rebase
  or squash each branch onto current `main`** and merge them **one at a
  time**, bumping the version at merge time. Naively merging parallel
  worktrees creates duplicated commits and produces thousands of lines of
  unnecessary `package-lock.json` churn (as happened around the daemon
  migrations near commit `e79d473`). One clean commit per plan is
  acceptable; before pushing, check `git log --oneline` for duplicated
  messages.
- **Changelog (`CHANGELOG.md`, MANDATORY on every commit)**: after bumping
  the version, add a new section at the top of the file (below the
  `# Changelog` header) in this format:
  ```
  ## [X.Y.Z] — YYYY-MM-DD
  ### Added / Changed / Fixed / Removed
  - short description of the change (in English, 1–2 sentences)
  ```
  Use the Keep a Changelog categories: `Added` (new), `Changed`
  (modifications), `Fixed` (bugs), `Removed` (removed). Only list what the
  current session changed — don't duplicate older entries.
- **Test gate before commit (MANDATORY)**: after EVERY code change, BEFORE
  you commit, run `npm test`. It must be **100% green**. If something is
  red:
  1. First determine whether it's a **regression** (broken production code)
     or the **test needed updating** (a deliberate behavior change).
  2. Regression → **fix the code**, don't "tune" the test to match the
     wrong result. Only change a test when the behavior changed on purpose
     — then update the assertion to describe the new, correct behavior.
  3. Only once `npm test` passes → commit + push.
  Additionally, depending on the area touched: if you touch
  `bin/liquidflow.js`/CLI boot/pty → also `npm run test:e2e`; if you change
  UI text → check i18n parity (see "Translations"). New logic = a
  new/changed `*.test.js` in the same commit (see "Rule" in the Tests
  section). Never commit code with a red suite intending to "fix it
  later".
- **CLI verification**: rendering is tested under a pseudo-terminal, e.g.
  `script -q /dev/null node apps/cli/bin/liquidflow.js` (colors:
  `FORCE_COLOR=3`). The "Raw mode is not supported" error only shows up
  without a TTY (e.g. `node -e`/a pipe) and doesn't indicate a bug.

## Running / building

```bash
npm install                # all workspaces (once)
npm run dev                # desktop (Vite + Electron, hot-reload)
npm run build:mac|win|linux  # desktop packages -> apps/desktop/release/
npm run cli                # CLI from the repo (or: npm link --workspace @liquidflow/cli && liquidflow)
```

## Tests (Vitest)

The test suite guards the core against regressions across iterations.
**Runner: Vitest** (one for the whole monorepo, native ESM). Config:
`vitest.config.js` (root). Running it:

```bash
npm test           # vitest run — unit/integration/component (fast, deterministic)
npm run test:watch # watch mode
npm run test:cov   # with coverage
npm run test:e2e   # CLI e2e under pseudo-TTY (slower, SEPARATE config — NOT in `npm test`)
```

- **Location**: tests live **next to the source** — logic as `*.test.js`
  (`packages/core/src/*.test.js`, `apps/cli/src/*.test.js`), Ink components
  as `*.test.jsx` (`apps/cli/src/components/*.test.jsx`; classic JSX —
  components import `React`). Manual render-smoke scripts
  (`apps/cli/test/*.mjs`) remain as a quick visual check — you run them via
  `node`; Vitest does **not** collect them (`include` targets
  `*.test.js`/`*.test.jsx`).
- **Ink components (interactions)**: `ink-testing-library` (`render` →
  `lastFrame()` + `stdin.write`). Helper `test/helpers/ink.js`: `keys`
  (arrows/Enter/Esc as sequences), `press(stdin, ...keys)` (waits for a
  re-render; **the first tick releases the `useInput` subscription** —
  without it the first keypress is lost), `frame(api)` (a frame with no
  ANSI). Layout at a GIVEN width (ink-testing-library has a fixed
  `columns=100`) is tested via `renderFrame(el, cols)` — used by
  `Header.test.jsx` (anti-overflow: no row > `cols`, logo doesn't break).
  Covered: `Picker`/`Form`/`ConflictList`/`ConnectList` (navigation,
  selection, Esc, toggle), `LogPane` (row budget + scroll), `Header`
  (widths). `commands.test.js` checks slash-command wiring and the **safe
  default choice** in `/conflicts` (the cursor never starts on a deleting
  action).
- **Disk-state isolation**: `test/setup/tmpHome.js` (setupFile) creates a
  fresh `LIQUID_FLOW_HOME` (tmp dir) **per test file**, BEFORE `store.js`
  computes `APP_DIR` at import time, and cleans up after `afterAll`. Within
  one file, tests share that directory → **isolate by shop name**
  (`TestShop${n++}`), don't rely on a clean disk between `it()`s.
- **Mock SOAP**: `test/helpers/mockSoapServer.js` is a local
  `http.createServer` impersonating `iSklep24Service.asmx`. Point the
  client at `srv.url` (default `http://127.0.0.1:PORT`; option `{
  host:'localhost' }` + `srv.port` for `signInShop` tests, whose URL
  validation requires `https://` OR `http://localhost:…`) — the
  `ISklep24Client`/`Controller` integration tests run over a REAL socket
  with no network. `handlers[Method] = (req) => result` (string/bool →
  `<MethodResult>`, `{resultXml}`, `{fault}`, `{setCookie}`, `{raw}`);
  `srv.requests` captures requests; `liquidTemplateXml({…})` builds the
  `<LiquidTemplate>` for `Liquid_FilesGet`/`MetaGet` responses.
- **Client injection / mock URL**: `new SyncSession(shop, tpl, { client })`
  injects a fake client (conflict logic/sync/`command()`/watcher run on the
  real `store`). `Controller` has NO client injection — it builds one from
  `shop.Url`, so in tests you seed a shop with a `Url` pointing at the mock
  SOAP server (`controller.test.js`, `controller.session.test.js`: connect
  → `selectTemplate` → start session → git).
- **Shared-state isolation (IMPORTANT)**: files with a FIXED path in the tmp
  home (`config.json`, the `.key` file) are shared across tests within one
  file. Tests that work on the config MUST clear
  `store.paths.CONFIG_PATH` in `beforeEach` (otherwise they fail under
  `--sequence.shuffle` — shop/language state leaks). File-based tests
  (store/sync/git) isolate with a UNIQUE shop name (`Shop${n++}`) and/or
  their own `mkdtempSync`. Create Controllers per-test and `dispose()` them
  in `afterEach` (this detaches global `logbuf` listeners); reset the log
  channel with `logbuf.setActiveChannel('app')`.
- **Coverage (`npm run test:cov`, `@vitest/coverage-v8`)**: ~82% of
  core+CLI lines. Layers: `git.test.js` (a REAL `git` in a tmp repo, push to
  a local bare repo; the whole suite is skipped if git is missing),
  `controller*.test.js` (session/shops/language/git via mock SOAP),
  `syncEngine.watcher.test.js` (`_processChange` hot-reload,
  `_initialDownload`, `start/dispose`, `_pollRefresh`),
  `syncEngine.command.test.js` (`download`/`upload`/`removeLocal/Remote`/
  `*All`/`refresh`), `soap.methods.test.js` (the rest of the contract:
  `Unlock`/`FileIsValid`/`Add`/`Set`/`Delete`/`Rename`),
  `commands.flows.test.js` (guards, `/settings`+language, `/connect`
  routing, `/git` menu, **confirmation for deleting actions**). Deliberately
  outside coverage: `open.js` (OS spawn), controller git wrappers that
  delegate to `git.js`, CLI form submission. Goal: the most important
  regression paths, not 100%.
- **CLI e2e (black box, `node-pty`)**: a separate config
  `vitest.e2e.config.js` (`npm run test:e2e`), files
  `apps/cli/test/e2e/*.e2e.js`. Helper `test/helpers/cliPty.js`
  (`startCli`/`makeHome`/`keys`) spawns the **real** `bin/liquidflow.js`
  under a pseudo-TTY (the CLI requires a TTY: alt-screen + raw mode), types
  keys, and waits for text (`waitFor`). `makeHome(config)` seeds
  `config.json` — e.g. a saved shop with a `Url` pointing at the **mock
  SOAP** from Phase 1 (a separate test process, a real socket):
  `connect.e2e.js` walks ConnectList → SignIn → Liquid_Get → the template
  picker through the whole binary. **Three traps** (baked into the helper,
  don't touch): (1) node-pty unpacks the prebuilt `spawn-helper` WITHOUT the
  `+x` bit → `posix_spawnp failed`; `ensureSpawnHelper()` does a `chmod`
  (self-heals, survives `npm install`). (2) **Don't** set `CI=1` — Ink
  won't render then (blank screen). (3) Vitest injects
  `NODE_OPTIONS`/`VITEST_*`/`TINYPOOL_*` into workers — inherited by the
  spawned `node` they break CLI startup; the helper strips them from the
  child's environment. E2e is **excluded from `npm test`** (slower/less
  deterministic) — its own config, `fileParallelism: false`, one worker.
- **Rule**: every new logic module in `core` (or pure CLI logic like
  `window.js`) gets a `*.test.js`. New i18n text → the PL/EN parity test
  already catches it (`translations.test.js`). Remaining Phase 3 tracks
  (to do): web renderer (`@testing-library/react`+jsdom; needs a
  `window.api` stub from preload) and desktop e2e (Playwright `_electron`
  on a built Electron app).

## Open topics

Known/open: possible log-readability improvements (level icons `✓/ℹ/✗`,
"Downloaded/Sent" instead of button labels, a shorter file identifier); no
`git clone/pull` from remote (a collaborator can't pull history through the
app); desktop receives the `progress` event but doesn't have a startup
loader UI yet; an old git repo at the template level isn't automatically
migrated into `0`.

> The history of what was done and when lives in `CHANGELOG.md` and
> `plans/README.md` (plan statuses) — don't duplicate it here.
