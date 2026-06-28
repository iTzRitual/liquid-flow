# Changelog

All notable changes to Liquid Flow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: `0.MINOR.PATCH` — patch increments with every commit, minor on larger milestones.

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
