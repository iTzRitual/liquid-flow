# Changelog

All notable changes to Liquid Flow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: `0.MINOR.PATCH` — patch increments with every commit, minor on larger milestones.

---

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
- `/conflicts` "↑/↓ more" indicators now have **symmetric spacing**: the inter-card blank line moved from a trailing line on each card to a separator *between* cards, so the bottom indicator hugs the last card's content the same way the top indicator hugs the first — previously the trailing blank gave the bottom indicator an extra gap.

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
