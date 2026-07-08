# Changelog

All notable changes to Liquid Flow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: `0.MINOR.PATCH` — patch increments with every commit, minor on larger milestones.

---

## [0.9.175] — 2026-07-08

### Fixed
- `HubScreen`'s `SyncHeader` reserved no clearance for window controls, so on Windows/Linux (min/max/close, top-right) the "Otwórz folder"/"Otwórz sklep"/"Odśwież" actions overlapped the controls when rendered inside `WindowChrome`. Added the same `pt-12` clearance already used on `Sidebar` for macOS's traffic lights.

## [0.9.174] — 2026-07-08

### Changed
- Merged the "Gemini as an implementation subagent" workflow section into the now-translated English `CLAUDE.md` (instead of reintroducing Polish prose from an earlier draft) and corrected the Gemini MCP tool list — there is no separate `sandbox-test` tool; `sandbox` is a flag on `ask-gemini`. Added `brainstorm`/`ping`/`Help` to the documented tool list.

## [0.9.173] — 2026-07-08

### Changed
- Translated the root `CLAUDE.md`, `apps/cli/CLAUDE.md`, and `apps/desktop/CLAUDE.md` from Polish to English — these files are read only by AI agents (no human-facing audience beyond the maintainer), and English tokenizes more efficiently for the model. `README.md` and `CHANGELOG.md` stay as they were (README targets Polish e-Sklep users; the changelog was already English-only).

## [0.9.172] — 2026-07-08

### Added
- Added a "Zasady pracy z kodem (ogólne)" section to the root `CLAUDE.md` (adapted from https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md): think-before-coding, simplicity-first, surgical changes, and goal-driven execution guidelines.

## [0.9.171] — 2026-07-08

### Changed
- Split the 703-line root `CLAUDE.md` into a concise architecture/workflow overview plus two directory-scoped files (`apps/cli/CLAUDE.md`, `apps/desktop/CLAUDE.md`) that only load when working in those folders. Documented the shared-daemon architecture (`connectController`/`DaemonClient`, plans 022–030) in the root file, which had no mention of it despite it being fully shipped. Fixed the stale claim that desktop redesign work happens on a `redesign` branch — that branch was merged into `main` long ago and all redesign work lands directly on `main`. Removed the "Aktualny stan prac" narrative, which duplicated `CHANGELOG.md`.

## [0.9.170] — 2026-07-08

### Added
- The three new design-system screens (`OnboardingScreen`, `SelectTemplateScreen`, `HubScreen`) are now selectable inside the `Systems/macOS`, `Systems/Windows`, and `Systems/Linux` window-frame previews — both via the `screen` dropdown and as their own named stories. Rendered inside the design-system `WindowChrome` (prop-driven, no AppCtx); the legacy screen entries still work unchanged.

### Fixed
- `SelectTemplateScreen` and `HubScreen` reserve the top strip of the shop rail (`pt-12`) so the macOS traffic-light window controls no longer overlap the "Sklepy" label when the screen sits inside `WindowChrome`.

## [0.9.169] — 2026-07-08

### Added
- `gemini-mcp-tool` MCP server registered in `.mcp.json` (project scope): lets the main session model delegate large-context file search and sandboxed code prototyping to Gemini via the locally-installed, OAuth-authenticated Antigravity CLI (`agy`) — no separate API billing, runs alongside `advisor()` rather than replacing it. Documented in `CLAUDE.md`.

## [0.9.168] — 2026-07-07

### Added
- `ContentSurface` design-system template: the framed, full-window-height main-content card that floats inside a delicate 8px inset from the window edges. `center` centers a max-width block (onboarding / template picker); the default fills it top-to-bottom (Hub header + body).

### Fixed
- Screen main areas now use the correct layout: a full-height bordered/elevated surface with delicate padding (matching the reference screens), instead of a small card floating in the middle of the content region. `OnboardingScreen`, `SelectTemplateScreen`, and `HubScreen` route their content through `ContentSurface`; `SplitMarketingForm` no longer bakes in the frame (it now hands its right slot to `ContentSurface`).

## [0.9.167] — 2026-07-07

### Added
- Design-system templates (pure layout scaffolds, a Storybook story and a Vitest test each): `WindowChrome` (frameless window with macOS/Windows/Linux controls + drag strip, self-contained — no legacy window-size provider), `AppShell` (sidebar + main two-column shell), `SplitMarketingForm` (onboarding hero/form split).
- Design-system screens assembled from the organisms/templates (presentational; local UI state only, actions via props): `OnboardingScreen` (marketing + sign-in form), `SelectTemplateScreen` (shop rail + template card), `HubScreen` (shop rail + template header + "Pliki" file tree + tabbed activity log, with optional conflicts/git slots). Each with a Storybook story + Vitest test; verified live in Storybook.

### Changed
- Design-system `Tabs.Tab` labels no longer wrap (`whitespace-nowrap`) — a hyphenated label such as "Git-Backup" stays on one line.

## [0.9.166] — 2026-07-07

### Added
- Design-system organisms (TypeScript, a Storybook story and a Vitest test each), composed from the atoms/molecules and presentational only (data via props; IPC lands in the later container step): `Sidebar` (shop rail), `SyncHeader` (Hub header with ID/conflict badges + folder/shop/refresh actions), `ActivityLog` (log feed), `TemplateList` (template rows with lock badge + selecting spinner), `FeatureList` (onboarding features), and `FileTree` — a new data-driven folder/file tree that owns its own expand/collapse state. Verified in Storybook against the Figma screens in light and dark mode.
- `Lock` and `Plus` icons added to `foundations/icons.ts`.

## [0.9.165] — 2026-07-07

### Added
- Design-system molecules (TypeScript, a Storybook story and a Vitest test each): `OrDivider`, `CardShell`, `FeatureItem`, `FormField`, `SwitchField`, `LogRow`, `FileTreeRow`, and `Tabs` (segmented, on Base UI). Composed from the atoms and verified in Storybook against the Figma screens.

### Changed
- Renderer test setup now stubs `ResizeObserver` and `matchMedia` (jsdom lacks them; Base UI references them during render).

## [0.9.164] — 2026-07-07

### Added
- Design-system Tier-1 atoms (TypeScript, isolated `--ds-*` Tailwind styling, a Storybook story and a Vitest test each): `Button`, `Input`, `Label`, `Text`, `Badge`, `StatusDot`, `Avatar`, and a `Switch` built on Base UI (`@base-ui-components/react` 1.0.0-rc.0). Icons come from `foundations/icons.ts` rather than a separate atom. All verified in Storybook against the Figma screens.

## [0.9.163] — 2026-07-07

### Fixed
- Test suite reliability: run the node test files serially (`fileParallelism: false`). Several Ink component and Controller suites are timing-sensitive — they passed in isolation but flaked under cross-file CPU/IO contention, making `npm test` intermittently red. Serial files recreate the isolation condition (same rationale as the separate e2e config); the desktop renderer suite still runs after, from its own config.

## [0.9.162] — 2026-07-07

### Added
- Design-system foundation, fully isolated from the legacy renderer styles: token layer as shadcn-style CSS custom properties (`--ds-*`, HSL channels) extracted from the Figma screens, plus a `Design System/Tokens` Storybook page (colors, typography, spacing, radius, elevation, and a warm-vs-slate neutral comparison).
- Design-system foundations: `theme.css` (own Tailwind entry via `@config`, isolated from `index.css`/`tailwind.config.js`), `cn` helper, Lucide icon set, and Framer Motion presets.
- Renderer test harness: TypeScript config, jsdom + Testing Library + jest-dom, run from a separate `vitest.renderer.config.js` after the node suite (new `test:renderer` script); Storybook stories glob now accepts `ts`/`tsx`.

## [0.9.161] — 2026-07-07

### Changed
- Moved the Window Chrome preview out of `Screens/Window Chrome` into a new `Systems/*` category (macOS, Windows, Linux), one story per platform, sharing a `SystemWindow` renderer and a `screen` select control (`stories/systemPreview.jsx`) — pick the OS from the sidebar, then the screen to preview inside it via Controls.

## [0.9.160] — 2026-07-07

### Added
- Select Template screen in the Storybook design gallery (`SelectTemplate.jsx` + `Avatar.jsx`), matched 1:1 against the Figma mockup via the `figma-mcp-go` MCP connection: shop sidebar (monogram avatar, active-shop check, "Dodaj sklep" footer) and a flat template list card, reusing Onboarding's inset-card/window layout conventions. Added the `SelectTemplateHeading` translation key (PL/EN).
- `screen` control on the `Screens/Window Chrome` story, letting Storybook switch the previewed screen between Onboarding and Select Template inside the same window chrome.

## [0.9.159] — 2026-07-07

### Removed
- Reverted the Storybook-only Select Template screen (`Avatar`, `TemplateListItem` components; `Sidebar`, `SelectTemplateContainer` features; `SelectTemplateScreen`) and the `SelectTemplateHeading` translation key added in 0.9.156–0.9.158 — the visual approach didn't match the intended design closely enough. Back to the pre-screen baseline to restart it.

---

## [0.9.155] — 2026-07-06

### Changed
- Translated every source code comment across the monorepo (core, CLI, desktop, MCP, tests) from Polish to professional, descriptive English. User-facing UI text and translation tables (`translations.js`) are unaffected — only `//`/`/* */` comments changed.
- Added a mandatory code-comment rule to CLAUDE.md: comments must always be in English, professional and descriptive (explaining why, not what), with no traces of the editing process or chat conversation.

---

## [0.9.154] — 2026-07-05

### Changed
- Onboarding container top gutter is now platform-aware: on macOS the form container sits flush with the side gutter (window controls are on the left, so no top reservation is needed); on Windows/Linux the top gutter is shortened to just clear the corner controls. `Onboarding` takes a `platform` prop for this.

---

## [0.9.153] — 2026-07-05

### Changed
- Window chrome now matches the design: no separate title bar and no app name — the window controls float directly over the content (macOS traffic lights top-left, Windows/Linux min/max/close top-right). Onboarding restyled so the window surface is a light gray and the form lives in its own inset white rounded container, with the top gutter reserved for the floating controls.

---

## [0.9.152] — 2026-07-05

### Added
- `WindowChrome` component: frameless application window with custom, per-platform controls (macOS traffic lights, Windows and Linux/Adwaita min/max/close) instead of the native OS title bar. Storybook story `Ekrany/Okno aplikacji` renders the full app window (with the onboarding screen inside) as a floating desktop window in macOS/Windows/Linux variants.

---

## [0.9.151] — 2026-07-05

### Added
- Onboarding redesign iteration 0 (branch `redesign`): new two-column `Onboarding` screen (branding/hero + first-shop form + import) built on design tokens with real shadcn primitives, plus its Storybook story. New PL/EN i18n keys for the onboarding copy and feature bullets.

---

## [0.9.150] — 2026-07-05

### Added
- Storybook 10 (react-vite) as a design gallery for the desktop redesign (branch `redesign`): `.storybook` config, a mocked `AppCtx` harness (`renderer/src/stories/mock.jsx`) with real PL/EN translations and fixtures, and initial Sidebar/ConflictsPanel stories. Light/dark toolbar toggle.
- `@storybook/addon-mcp` exposing a Storybook MCP server at `http://localhost:6006/mcp`, registered for Claude Code in `.mcp.json` (project scope). CLAUDE.md documents the mandatory MCP-first workflow for desktop UI work.

### Changed
- `AppCtx` is now exported from the desktop `App.jsx` so screens can be rendered in isolation with a mocked context.

---

## [0.9.149] — 2026-07-04

### Fixed
- Desktop no longer starts to a blank/black window: the new shop export/import
  screens imported `@liquidflow/core` into the renderer, pulling Node built-ins
  (`node:fs`/`node:crypto`) into the browser bundle and breaking the module graph.
  The renderer now uses a local `fmt()` token formatter and talks only via IPC.
- CLI shop export/import no longer hangs on a spinning loader after finishing:
  `withLoading` does not auto-return to the input screen on success, so the
  export-saved, import-done, read-error and nothing-selected paths now explicitly
  return to input. Added regression tests in `commands.flows.test.js`.

## [0.9.148] — 2026-07-04

### Added

- Share shop configuration between machines: in-app export/import of selected
  shops (CLI and desktop), passphrase-protected (PBKDF2 + AES-256-GCM), with a
  per-shop selection step and name-collision resolution (skip/update/rename).
  Passwords are re-encrypted under the importing machine's local key; the MCP
  server is intentionally excluded.

## [0.9.147] — 2026-07-03

### Fixed

- Daemon now shuts down cleanly once the last client disconnects (after a short grace) instead of running forever whenever a sync session was active — no more orphaned `liquidflow-daemon` processes. Tests/e2e reap spawned daemons; the Electron-hosted daemon now runs headless as node (`ELECTRON_RUN_AS_NODE=1`); a `daemon.pid` file is written next to the socket.

## [0.9.146] — 2026-07-02

### Fixed

- Pinned desktop data home (`LIQUID_FLOW_HOME`) to `@liquidflow/core`'s `defaultAppDir()` so Desktop, CLI, and MCP share the exact same data directory and daemon (Plan 028).

## [0.9.145] — 2026-07-02

### Changed

- Recorded the CLI's shared-daemon migration in the changelog — the CLI now
  attaches to the daemon via `connectController()` like the MCP and desktop
  apps (plan 023); the entry was omitted when the parallel migration worktrees
  were merged.

### Fixed

- Added a parallel-executor-worktree hygiene note to `CLAUDE.md` and verified
  `package-lock.json` matches a clean install after the daemon migrations.

## [0.9.144] — 2026-07-02

### Changed

- Desktop app attaches to the shared daemon; logs/state/shops are shared live with the CLI and MCP.

## [0.9.143] — 2026-07-02

### Changed

- MCP server attaches to the shared daemon; agent-driven sync is now visible in the CLI/desktop and shares one watcher.

## [0.9.142] — 2026-07-02

### Fixed

- Hardened DaemonClient.connect() to wait for initial snapshot before resolving so getState() is non-null immediately after connect (plan 026).
- Fixed malformed Windows named-pipe path in daemonSocketPath().

## [0.9.141] — 2026-07-02

### Added

- Shared daemon foundation: a headless process (`liquidflow-daemon`) owning one
  Controller, with `DaemonClient` and a `connectController()` factory in
  `@liquidflow/core` for CLI/desktop/MCP to attach over a local socket. No app
  is migrated yet (plans 023–025). `LIQUID_FLOW_NO_DAEMON=1` forces in-process.

## [0.9.140] — 2026-07-02

### Added

- Added `@liquidflow/mcp`, an MCP (Model Context Protocol) server workspace exposing sync, conflict resolution, log polling, and git checkpoints to AI agents over stdio (plan 020).

## [0.9.139] — 2026-07-02

### Changed

- CLI process name now appears as `liquidflow` instead of `node` in process listings.
- Removed `node` wrapper from CLI start script to show proper process name.

## [0.9.138] — 2026-07-02

### Changed

- Removed `plans/` from `.gitignore` so planning documents are tracked and pushed to the repo.

## [0.9.137] — 2026-07-02

### Changed

- Reverted the "no conflicts" info screen back to dismissing on any keypress (not Enter-only), with the hint text simplified to a plain "Zamknij dowolnym klawiszem" / "Close with any key" (no live countdown text).

## [0.9.136] — 2026-07-02

### Fixed

- The "no conflicts" info screen now closes only on Enter (was: any key, which made it too easy to dismiss accidentally); hint text updated to say "Enter zamyka/closes" instead of "any key". Also fixed a height-accounting bug where the screen's natural height didn't include its title line, leaving a stray blank row at the bottom of the terminal.

## [0.9.135] — 2026-07-02

### Changed

- `/conflicts` with nothing to resolve no longer just flashes a log line and instantly returns to input (looked like a popup that vanished before it could be read). It now shows a dedicated "no conflicts" screen for a few seconds, with a live countdown, dismissible instantly by any keypress.

## [0.9.134] — 2026-07-02

### Added

- CLI conflict resolution now auto-navigates when a file is resolved in the background (e.g. after editing and saving in the IDE diff view opened via `o` — the watcher uploads the file and the next background poll drops it from `mismatches`): while viewing a conflict's diff, the app now detects that its file is no longer conflicted and automatically returns to the (refreshed) `/conflicts` list if others remain, or to the main screen if it was the last one — no need to manually back out and re-open `/conflicts`.

## [0.9.133] — 2026-07-02

### Changed

- The "too large" conflict preview no longer dead-ends: the terminal line-by-line diff still bails out above the size threshold (rendering a huge diff in-terminal is impractical), but `previewConflict` now keeps the raw local/remote content in that case, so the "open in IDE" action (`o`) is available there too — the IDE computes its own diff, unaffected by our terminal-rendering limit.

## [0.9.132] — 2026-07-02

### Added

- CLI conflict diff preview (`/conflicts` → Podgląd) now has an "open in IDE" action (`o` key): opens the local file against the remote version in a `code --diff` window (overridable via `LIQUIDFLOW_DIFF_CMD` for other VS Code-based editors), so you can resolve the conflict by editing the real local file and commit/push it through the normal git flow.

## [0.9.131] — 2026-07-01

### Changed

- Byte-identical timestamp conflicts are now auto-resolved instead of shown. When a file is flagged as a `Timestamp` conflict (e.g. after syncing the same template from another machine) but its content is identical, the conflict is silently reconciled (the metadata baseline is re-stamped, no bytes transferred) and never appears in `/conflicts`. Only real content differences are surfaced. A per-file cache keyed on the timestamps prevents genuinely-different files from being re-fetched on every background poll.
- The conflict diff preview window now actually grows when you press Tab to expand context: the expand state drives the overlay height, so a large file with a small change (or an all-context file) opens compact and expands to a full-height, scrollable view — instead of cramming the expanded content into a one-row viewport.

### Removed

- The per-row "Reconcile" (Uzgodnij) action on timestamp conflicts. It is obsolete now that identical-content conflicts are auto-resolved and never reach the list.

---

## [0.9.130] — 2026-07-01

### Added

- Expand folded context in the conflict diff preview (CLI): the preview still collapses long runs of unchanged lines by default, but pressing Tab now reveals every hidden line with its line number (press again to collapse). The Tab hint only appears when there is something folded to show.

---

## [0.9.129] — 2026-07-01

### Added

- Byte-free "Reconcile" action for Timestamp conflicts (CLI): when a conflict is only a timestamp drift (e.g. after syncing the same template from another machine) and the content is byte-identical, Reconcile re-stamps the metadata baseline to clear the conflict without re-uploading or downloading. It is guarded — if the content actually differs, it refuses with a clear message ("Content differs — use Download or Upload") so it can never hide a real change.

### Changed

- The conflict diff preview now shows "Identical content — only the timestamp differs" instead of the ambiguous "No differences" when local and remote bytes match (line-ending differences count as identical).

## [0.9.128] — 2026-07-01

### Fixed

- The conflict preview for too-large and binary files no longer renders a corrupted/duplicated frame. The title in the `tooLarge`/`binary` branches is now truncated (`wrap="truncate-end"`) so a long file path can't wrap, and the overlay height budget for non-text previews now accounts for the actual 5-row box, preventing Ink inline-overflow.

## [0.9.127] — 2026-07-01

### Fixed

- Initial template download no longer rewrites the whole meta file per file (O(n²) synchronous I/O). Metadata is now accumulated in memory and flushed in batches, fixing UI freezes on template selection for templates with many files (most visible on Windows). Crash-safety is preserved via a final flush on interruption.

## [0.9.126] — 2026-07-01

### Added

- Desktop: sync-start progress loader (download/check) and visual styling for log session-separators and greyed historic entries, matching the CLI.

## [0.9.125] — 2026-07-01

### Added

- Desktop: git pull (fast-forward target stream) and branch management — list/switch/create — matching the CLI /git menu. (Clone deferred to the plan 009 connect-time bootstrap.)

## [0.9.124] — 2026-07-01

### Fixed

- Desktop: remove a duplicate `fmt` export in the renderer utils that broke `vite build` (introduced by merging the 011 and 012 desktop plans).

## [0.9.123] — 2026-06-29

### Added

- Desktop: read-only diff preview before resolving a conflict (download/upload), matching the CLI. Computed in the main process; binary/too-large variants handled.

## [0.9.122] — 2026-06-29

### Added

- Desktop: git "checkpoint" action to publish accumulated versions (wip → target branch), with a pending-versions indicator. Brings desktop git to parity with the CLI.

## [0.9.121] — 2026-06-29

### Added

- Checkpoints can now target any branch, not just `main`. The `/git → checkpoint` flow opens a target-stream picker (existing branches + "New branch…") before asking for the message; the chosen branch becomes the new target stream and is persisted per template (`git.targetBranch` in config).
- The status bar now shows an uncommitted-versions indicator (`+N` in orange next to the branch) — work sitting on the hidden working buffer that has not been checkpointed yet.

### Changed

- The internal `liquidflow/wip` working branch is now hidden from the UI: it no longer appears in the branch-switch list and the status/menu report the target stream instead of `liquidflow/wip`.
- "Switch branch" became "Switch stream": it now actually changes where auto-commits and checkpoints land (sets `targetBranch` and repoints the working buffer), instead of being silently reverted by the next auto-commit. Switching with uncommitted versions on the current stream requires confirming a discard.
- The remote-repository form is now pre-filled with the existing `origin` URL instead of opening empty.

### Fixed

- `gitSwitchBranch` no longer fails trying to force-update the currently checked-out working branch; it steps off the buffer first.

### Fixed

- The header "Git" row now appears immediately on entering a template with an initialized repo, instead of staying hidden until the next `emitGit()` (e.g. toggling auto-push). `_startSession` now emits the git status right after starting the sync session.

## [0.9.119] — 2026-06-29

### Added

- The current git branch is now visible in the CLI: `git.status()` returns a `branch` field, the header StatusBar "Git" row shows it (cyan, before the commit/push toggles), and the `/git` menu title now reads "branch <name> (<n> commits…)".

## [0.9.118] — 2026-06-29

### Fixed

- CLI `/git`: after completing an action that re-opens the git menu (e.g. switching a branch, checkpoint, pull, push, restore), pressing Esc now steps back to the main screen instead of returning to the stale confirmation prompt. `gitMenu()` now clears the pending parent on entry, so the refreshed top-level menu always backs out to the input.

## [0.9.117] — 2026-06-29

### Fixed

- Log entries containing embedded newlines (e.g. raw git stderr with multi-line fatal messages) are now collapsed to a single visual line in `log.js` via a new `oneLine()` helper in `renderText`. Prevents `LogPane`'s row-budget overflow that caused Ink to duplicate/garble the TUI frame.

### Changed

- `gitPull` and `gitPush` now pre-check `git.getRemote()` before attempting any network operation; if no remote is configured they emit a translated `GitNoRemoteConfigured` message and return cleanly instead of hanging or producing a cryptic git error.
- Auto-push in `gitCheckpoint` likewise skips the push and logs `GitNoRemoteConfigured` when no remote is set, so the checkpoint still succeeds locally.

## [0.9.116] — 2026-06-29

### Fixed

- Serialized all git index-mutating operations (`_doAutoCommit`, `gitRestore`, `gitCheckpoint`, `gitEnable`) through the session's single `runExclusive` queue, eliminating the `.git/index.lock` race condition that caused fatal errors under concurrent auto-commit calls.
- `createBranch` now accepts an optional `startPoint` argument; `_ensureWipBranch` passes `base` so `liquidflow/wip` is always rooted at `main` rather than whatever HEAD happens to be.
- Applied `--no-optional-locks` to `git status` reads in `commitAll`, `squashMergeInto`, and `status` to prevent lock-file contention from read-only status checks.
- Made the `cloneInto` bad-remote test network-free (uses a local non-repo directory instead of a DNS name).

### Added

- `SyncSession.runExclusive(fn)` public method: serializes any fn on the session queue without stopping the watcher (for git ops that must not race but must keep propagating hot-reload changes).
- Regression tests: `runExclusive` serialization order + watcher-active invariant; deterministic two-parallel-auto-commit test; `createBranch` start-point assertion.
- Increased per-describe timeout for heavy git integration test suites (`controller.session.test.js`, `git.test.js`) to avoid spurious timeouts under full-suite parallel load.

## [0.9.115] — 2026-06-29

### Fixed

- Cursor-position memory now also works for `/git` (and any list → same-type list transition). When stepping between two `picker` screens — e.g. the git menu into a submenu, or `/connect` into the "remove shop" picker — React was reusing the same component instance, so the parent's internal cursor state survived and `initialIndex` (which only seeds initial state) was ignored. Each overlay mode now carries a unique `uid` used as the React `key`, forcing a remount on screen-identity change so Esc restores the remembered row. Position is preserved within a screen (no extra remounts on navigation/toggle).

## [0.9.114] — 2026-06-29

### Fixed

- Esc back-navigation now restores the cursor position on list screens instead of jumping to the top. When you open a child screen (conflict preview, git submenu/form, confirmation) from `/conflicts`, `/connect`, `/git`, `/templates`, etc. and press Esc to return, the parent list re-highlights the row you came from. The selected position is persisted on the parent mode object via new `initialIndex`/`onIndexChange` props on `Picker`, `ConflictList`, and `ConnectList`.

## [0.9.113] — 2026-06-29

### Added

- Git workflow redesign: implemented a two-tier branch model using the `liquidflow/wip` branch for hot-reload auto-commits, leaving `main` clean for checkpoints.
- Added Git primitives: `currentBranch`, `listBranches`, `createBranch`, `switchBranch`, `forceBranch`, `countCommits`, `pull`, `squashMergeInto`, `cloneInto`.
- Added `SyncSession.withWatcherPaused` seam to safely pause/resume the file watcher around branch checkout, pull, and merge operations.
- Added `/git` commands in the TUI: Checkpoint, Pull, and Branch management (create/switch) with safety confirmation prompts.
- Added remote bootstrap: `gitClone` controller flow that clones mode-`0` repository, downloads other modes via SOAP, and seeds sync metadata to prevent walls of false conflicts on startup.
- Full Polish and English translations for all new Git operations.

---

## [0.9.112] — 2026-06-29

### Fixed

- `tsconfig.json`: configure `include`/`exclude` and `noEmit` to prevent TypeScript from trying to compile source files — resolves IDE errors about overwriting input files.

---

## [0.9.111] — 2026-06-29

### Added

- `previewConflict()` test coverage for Timestamp, LocalMissing, RemoteMissing conflicts and binary file detection.

### Changed

- `.gitignore`: ignore `plans/` directory for AI tooling artifacts.

---

## [0.9.110] — 2026-06-29

### Changed

- `/conflicts`: ↑/↓ now navigates between bulk action buttons in the footer (matching ConnectList behavior) — pressing ↓ from the last file enters the footer on the first button, ↑/↓ moves between buttons, exiting the footer jumps back to the file list.

---

## [0.9.109] — 2026-06-29

### Changed

- `/conflicts`: bulk action buttons (Download all / Upload all) no longer show the `›` row indicator — they now look like the footer buttons in the `/connect` screen.

---

## [0.9.108] — 2026-06-29

### Changed

- `/conflicts`: cursor now always starts on "Preview" instead of Download/Upload, so reviewing the diff is the default action before applying any change.

---

## [0.9.107] — 2026-06-29

### Fixed

- Diff preview scroll: pressing down arrow now always reveals one new line from below. The previous implementation showed a `↑ N more` indicator that stole a content row from the budget, causing the first down-press to only display the indicator without moving the content window. Removed the above indicator entirely — the line-number gutter already tells the user where they are.

## [0.9.106] — 2026-06-29

### Fixed

- Command palette / Picker / ConnectList: a "1 more" scroll indicator (`↑ 1 więcej` / `↓ 1 więcej`) now never appears — the hidden item is shown directly instead, since it fits in the same number of rows as the indicator it replaces. Pressing down no longer felt stuck when the last visible item had exactly one hidden neighbor.

## [0.9.105] — 2026-06-29

### Fixed

- CLI bottom spacer now hides only when the window is too small to fit a full header (auto-layout), not when the user manually set header to compact in preferences.

## [0.9.104] — 2026-06-29

### Changed

- CLI input mode: bottom spacer is now hidden when the header is in compact or none mode (small window), saving the row for content.

## [0.9.103] — 2026-06-29

### Changed

- CLI input mode: added one blank line below the input field so it no longer sits flush against the terminal bottom edge.

## [0.9.102] — 2026-06-28

### Fixed

- Log scroll: pressing up arrow now reveals one older entry per keypress instead of just adding the "↓ newer" indicator without moving the content window. When both scroll indicators (older/newer) were active, the internal anchor logic was re-deriving `start` from `end`, keeping the visible range frozen on the first scroll step.

## [0.9.101] — 2026-06-28

### Fixed

- **Conflict diff preview corrupted on Windows-line-ending (`\r\n`) templates.**
  `lineDiff` split only on `\n`, so every line kept a trailing carriage return;
  in the terminal `\r` jumps the cursor to column 0 and the next text overwrites,
  producing a diagonal "staircase" of cut-off lines and stray border bars.
  `lineDiff` now normalizes CRLF/CR → LF, and `DiffView` strips any remaining
  control characters (defensive against `\r` and ANSI escape injection from file
  content) before rendering.

## [0.9.100] — 2026-06-28

### Fixed

- **Conflict diff preview rendering** for deeply-nested templates. Leading tab
  characters made Ink mis-measure line widths (tab counted as 1 column, rendered
  as up to 8), so long lines never truncated and wrapped into a diagonal
  "staircase". Tabs are now expanded to 2 spaces and lines truncate correctly.

### Added

- Diff preview now shows a **line-number gutter**, **dedents** common leading
  indentation so nested tag content is visible (not just whitespace), and
  **folds long runs of unchanged context** into a `⋯ N unchanged lines` marker
  (new core helper `buildDiffRows` + `DiffFold` i18n key) so the actual change
  stands out instead of drowning in white context lines.

## [0.9.99] — 2026-06-28

### Added

- **Conflict diff preview**: before resolving a conflict users can now press
  `←/→` to select "Preview" on any conflict card and see a unified line diff
  (`+`/`-`/context) of what changed, without committing to download or upload.
  Implemented as a read-only `diff` overlay (Esc returns to the conflict list),
  powered by a new dependency-free LCS line-diff utility (`packages/core/src/diff.js`)
  and `SyncSession.previewConflict` / `Controller.previewConflict`. Binary and
  oversized files (>256 KB) show a graceful fallback message instead of a diff.

## [0.9.98] — 2026-06-28

### Changed

- CLI UI preferences (**log wrapping** and **header mode**) are now persisted in
  the core `config.json` (`LogWrap`, `HeaderMode`) instead of living only in
  session state. They are read from the controller state and survive a restart,
  matching how the language preference already behaved. New `Controller.setUiPref`
  saves the value and re-emits `state`.

---

## [0.9.97] — 2026-06-28

### Added

- New **Header** preference in `/settings` (Auto / Compact). `Auto` keeps the
  existing adaptive behaviour (full logo when it fits, degrading down as the
  window shrinks); `Compact` forces the one-line header at all times. Either way
  the header still degrades to hidden/guard when the window is too short.

---

## [0.9.96] — 2026-06-28

### Fixed

- `/conflicts` no longer cuts off file names at low terminal heights. Conflict cards now have an **adaptive height**: the name + action buttons row always renders, while the metadata/"which side is newer" lines degrade away only when the window is too short to fit them. The component also self-protects against frame overflow regardless of the budget passed by `App.jsx` (drops the "more" indicators when there isn't room for them next to a card).
- `/conflicts` "↑/↓ more" indicators now have **symmetric spacing**: the inter-card blank line moved from a trailing line on each card to a separator _between_ cards, so the bottom indicator hugs the last card's content the same way the top indicator hugs the first — previously the trailing blank gave the bottom indicator an extra gap.

---

## [0.9.95] — 2026-06-28

### Changed

- CLI overlays (pickers, `/conflicts`, `/connect`, forms, loader) now sit flush — removed the blank line between the dimmed log and the overlay's border, and removed the 1-row bottom margin so the overlay box reaches the terminal's last line. The whole app now renders at full height (`root height = termRows` instead of `termRows - 1`); offsets in `layout.js`/`App.jsx` and the window-too-small floor (`appMinRows` no longer adds +1) were adjusted accordingly. Verified clean (no frame doubling) under a real pseudo-terminal in alt-screen.

---

## [0.9.94] — 2026-06-28

### Changed

- CLI header now degrades based on each screen's **full** content height instead of its bare minimum: when an overlay (`/conflicts`, pickers, `/connect`, forms) has more items/cards than fit, the header shrinks (full → compact → hidden) to keep them visible rather than windowing content away. The degradation threshold is now shared with App.jsx's overlay-windowing math (`naturalBodyRows` in `layout.js`), so the header yields exactly when content would otherwise be cut. The window-too-small guard floor is unchanged.

---

## [0.9.93] — 2026-06-28

### Changed

- App version is now read from `package.json` at runtime (CLI `StatusBar`, core `Controller.getTranslations`) instead of hand-maintained literals — bumping the package version is the single source of truth.

---

## [0.9.92] — 2026-06-28

### Changed

- Window-too-small guard now uses a global floor (`appMinRows`) derived from the heaviest screen (`/conflicts` with bulk actions) instead of a per-mode threshold — the "too small" message no longer pops up mid-work when navigating into a heavier screen; the minimum is consistent across the whole app.

---

## [0.9.91] — 2026-06-28

### Added

- Full PL/EN i18n — all UI text, logs, errors, tray go through `translations.js`; live language switching in both apps
- Structured log entries (`tmsg` descriptors) — displayed logs retranslate on `/lang` change, including loaded history
- Persistent per-template log history (`logs/<tplId>.jsonl`, up to 1000 lines), loaded on session start with a separator
- Log channels (scopes): `app` / `shop:<id>` / `tpl:<shopId>:<tplId>` — only one active at a time
- Background conflict polling (`POLL_MS`) — no manual `/refresh` needed
- `/conflicts` screen: per-file action cards (3 timestamps, which side is newer), bulk actions in footer, confirmation for destructive actions
- `/connect` as dedicated `ConnectList` screen (shop list + Disconnect/Add/Remove footer)
- `/settings` menu: log wrap toggle + language selector
- Header layout: 2-column ↔ 2-row responsive, full redraw on resize
- Log scrolling with mouse wheel / arrow keys + `/wrap` word-wrap mode
- Window-height fill with input pinned to bottom
- Alt-screen + alternate scroll mode; Ctrl+C ignored (exit only via `/exit`)
- Header degradation on low windows: `full` → `compact` → `none` → `guard` (`WindowTooSmall`)
- `ConflictList`, `ConnectList`, `LogPane` scroll budgeting (hard overflow prevention)
- Vitest suite (~82% core+CLI coverage): unit, integration, component (Ink), e2e (node-pty)
