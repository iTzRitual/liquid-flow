# apps/cli — CLAUDE.md

Implementation details for the CLI (`@liquidflow/cli`, Ink/React in the
terminal). The root `CLAUDE.md` has the general architecture (daemon, core,
i18n, tests, versioning) — this file covers ONLY what lives under
`apps/cli`.

- **No build step to run**: `bin/liquidflow.js` registers `tsx`
  (`register()`), then dynamically imports `src/index.jsx`. JSX works
  directly.
- **JSX**: JSX files add `import React` (classic mode — independent of the
  tsx config; `tsconfig.json` has `react-jsx`, but don't rely on it).
- **Alt screen buffer + scroll**: `index.jsx` enters the alt screen
  (`\x1b[?1049h`) and leaves it on exit — no clutter in the terminal
  scrollback. Also "alternate scroll mode" (`\x1b[?1007h`): the mouse wheel
  in the alt screen sends ↑/↓ arrows to the app (instead of scrolling the
  terminal), so scrolling scrolls the log on the main screen. In `input`
  mode (palette closed) `App.jsx` handles `↑/↓`/`PgUp`/`PgDn` as `LogPane`
  scrolling (`logScroll`), and `setLogScroll(0)` after a command returns to
  the bottom. The sequences are turned on/off in pairs at start/exit.
- **Ctrl+C is deliberately ignored** (so an accidental press doesn't kill a
  sync session): `render(<App/>, { exitOnCtrlC: false })` + a no-op
  `process.on('SIGINT', …)` in `index.jsx` (a safeguard for when raw mode
  isn't available, e.g. a pipe). Exit **only** through the `/exit` command
  (calls `exit()` from Ink → a clean unmount + `leaveAlt`) or closing the
  terminal. The input field's hint says "/exit to quit".
- **Mode model in `App.jsx`** (`mode.type`): `input` (prompt + palette),
  `picker` (selection list), `form` (sequential form), `loading` (spinner
  while fetching). Helpers on `ctx`: `openPicker`, `openForm`,
  `withLoading`, `skipToInput`, `safe`, and `logWrap`/`setLogWrap` (log
  wrap mode for the `/wrap` command).
- **Back navigation (Esc goes back one screen, not to the input)**: every
  overlay opened gets a `mode.parent` pointer (the screen it came from). Esc
  (`onCancel` in components → `cancelTo(mode)` in `App.jsx`) shows the
  parent, and only from the top-level screen does it return to the input.
  The parent is carried through **async** opens (loader → screen) via
  `pendingParentRef`: it's set at the moment of user interaction — the
  `onSelect`/`onSubmit` wrappers (picker/form) and `onShop`/`onAction`/
  `onBulk` (connect/conflicts) store `pendingParentRef = self` right before
  the handler; the helper that opens the next overlay consumes it via
  `takeParent()` and wires it in as `parent`. It's cleared at the start of a
  command (`onSubmit`/boot — jumping from the input has no parent) and in
  `cancelTo`. **The `/conflicts` screen has `parent: null`** (always entered
  from the input; its confirmations get this screen as their parent, so Esc
  from a confirmation returns to the conflict list). Picker/Form still close
  to the input **after a selection** (`back()` in the wrapper) — `parent`
  only changes **Esc** behavior, not the selection itself. When the
  remembered parent stops being valid (e.g. after `init` the "no repo"
  screen disappears), the handler calls `ctx.dropParent()` before opening
  the next view, so Esc returns to the input instead of a stale screen.
  **Async re-opens** (e.g. `gitEnable()` → `gitMenu()`) go through
  `withLoading`, not `safe` — `back()` in the picker wrapper would render a
  "bare" input before the view opens (a flash of the main screen); the
  loader's spinner holds the frame until it opens. `withLoading(label, fn,
  title?)` accepts an optional `title` that overrides the default loader
  heading (`t.SelectTemplate`).
- **Components**: `Header` (header = 2 columns: logo and info; the logo has
  `flexShrink=0`, the info column `flexGrow=1` + `justifyContent="space-between"`
  — status clings to the top, the conflicts indicator to the right and to
  the bottom/Divider), `Banner` (ASCII + a per-character rainbow gradient,
  17×6), `StatusBar` (`~` when disconnected; Shop/Template/Git only when
  they exist; each row is one `<Text wrap="truncate-end">`, so on a narrow
  window it truncates as a whole instead of breaking labels/adding blank
  lines), `LogPane` (the main screen's log — SCROLLABLE and with a wrap
  mode. `buildVlines(log, wrap, cols)` flattens entries into "visual rows":
  `wrap=false` → 1 entry/row `truncate-end`, `wrap=true` (`/wrap`) → long
  entries wrapped via `wrap-ansi`+hard. Rendering windows the vlines by
  `scroll` (rows from the bottom; 0 = newest) and always fits the `rows`
  budget — the "↑/↓ more" indicators take a row out of the window. **The
  budget is hard even at `rows===1`**: `avail` (room for entries) is NOT
  floored to 1 — when the "↑" indicator is needed, `avail` drops to 0 and
  only the indicator shows (no entry), instead of indicator+entry = 2 rows
  (overflow → Ink truncates/duplicates the frame). `LogEmpty` renders only
  when the log is truly empty (`total===0`), not when there was no room for
  entries. **Scroll invariant:** `maxScroll = vlines - rows + 1` (the top
  "↓" indicator takes a row, so without the `+1` the oldest entries can't
  be revealed) — `App.jsx` and `LogPane` MUST compute this the same way.
  Test: `node apps/cli/test/logpane-scroll.mjs`), `Divider` (character `─`,
  color `#82bbff`), `Picker` (action items + `kind:'toggle'` items switched
  with `←/→`), `Form` (text fields and `type:'choice'` Yes/No via arrows),
  `ConflictList` (dedicated `/conflicts` screen — see below), `ConnectList`
  (dedicated `/connect` screen: shop list ↑/↓ + a footer action row —
  Disconnect/Add/Remove, ←/→ and ↑/↓ walk the buttons in the same order —
  see below), `ProgressView`+`Spinner` (download/check loader),
  `CommandPalette`. Header layout is tested at various widths:
  `node apps/cli/test/header-widths.mjs`.
- **`ConflictList.jsx` (the `/conflicts` screen)** — does NOT use `Picker`
  (a different layout model). Each file is a **3-row card**: (1) the name on
  the left (`truncate-end`) + action buttons on the right (`flexShrink=0`),
  (2) metadata (timestamps + which side is newer), (3) a blank line. A fixed
  footer at the bottom: a blank line + one row of bulk operations
  (Download/Send all). Navigation: `↑/↓` between cards and the footer,
  `←/→` picks the action in a row, `Enter` executes, `Esc` cancels.
  **Actions match the conflict type** (2 options each): Timestamp →
  Download/Send; LocalMissing → Download/Delete in shop; RemoteMissing →
  Send/Delete locally. The default choice is never a deletion; deletions go
  through a confirmation (`confirmStay` — "No" returns to the list). **The
  ←/→ cursor belongs only to the current row and is NOT remembered** (a
  single `cursor` state, not a per-file map): entering a card (↑/↓) resets
  it to a safe `initial`, because only Enter matters — it acts immediately
  on the current card. All buttons are **full-contrast** (default `color`);
  highlighting (cyan background, black text) belongs EXCLUSIVELY to the
  `focused` row's cursor — no gray "unselected" states. After an action the
  list refreshes and stays open (you resolve the next files without
  re-invoking `/conflicts`). Cards are windowed by `windowCards(n, idx,
  budget, 3)` in `window.js` (fixed card height = 3 rows, "↑/↓ more"
  indicators). **A note on emoji:** in the truncated metadata row do NOT
  use `U+FE0F` emoji (📄💾☁️) — they sometimes count as 1 but render as 2
  characters, breaking the right border; in buttons (a flex box measured by
  Yoga, e.g. 🗑) it's fine.
- **Header layout (`Header.jsx`) — DO NOT break!** A deliberate
  **2-column** layout; it's been broken repeatedly in the past, so the
  rules are hard:
  ```
  ┌ marginTop=1 ──────────────────────────────────────────────┐
  │  LOGO            INFO (one column, flexGrow=1)              │
  │  (Banner)        Liquid Flow CLI 0.9      ← status at top    │
  │  flexShrink=0    Shop:     ● …  (truncate-end)               │
  │  17×6            Template: …                                 │
  │                  Git:      …                                 │
  │                              ⚠ Conflicts: N (/conflicts) ◄──┤ right, bottom
  └────────────────────────────────────────────── Divider ─────┘
  ```
  Invariants:
  1. **Two columns, not three.** Logo + info column. Conflicts is a **row
     inside** the info column (separate from the status rows), and NOT a
     third column — otherwise it steals width from "Shop/Template".
  2. **Logo `flexShrink={0}`** — never shrinks or wraps (wrapping the ASCII
     art = "the logo falls apart").
  3. **Info column `flexGrow={1}` + `flexDirection="column"` +
     `justifyContent="space-between"`** — status clings to the top,
     conflicts to the bottom.
  4. **Conflicts**: `<Box justifyContent="flex-end">` (right-aligned) with
     `<Text wrap="truncate-end">`, rendered only when `mismatches.length>0`.
     Stuck to the Divider, **doesn't add a row** (header height = logo
     height). No `marginBottom` on the header.
  5. **Every `StatusBar` row = one `<Text wrap="truncate-end">`** (label and
     value as nested `<Text>`s). Otherwise on a narrow window labels break
     and blank lines appear. The only element that yields width is the info
     column (the URL truncates) — logo and indicator never do.
  6. **Very narrow window (`cols < HEADER_STACK_COLS`, threshold in
     `Header.jsx`)**: the layout switches from 2 columns to 2 rows (logo on
     top, info at full width below). `App.jsx` passes `cols={termCols}` and
     bumps the `HEADER` constant for the stacked header (it's taller).
  7. After changes: `node apps/cli/test/header-widths.mjs` (checks 30–120
     cols, including the column↔row switch).
- **Colors / contrast — adapt to the terminal theme (DO NOT break!)**: the
  CLI must be readable on **both dark AND light** terminal backgrounds. Hard
  rules:
  1. **Base text → no `color`** (the terminal's default foreground: light on
     dark, dark on light). NEVER `color="white"` as a plain foreground — it
     disappears on a white terminal (this was a bug). Applies to, among
     others, unselected list items (`Picker`/`ConnectList`/`ConflictList`)
     and the default log entry (`LogPane.inkColor` maps `#FFF` →
     `undefined`, not `'white'`).
  2. **Hints / secondary text → `dimColor` WITHOUT `color="gray"`.** `gray`
     is ANSI bright-black (~#666), and `dimColor` (SGR 2) dims it even
     further → nearly invisible on a black background (double dimming).
     `dimColor` alone dims the default foreground → readable on both
     backgrounds. Applies to navigation footers and "more ↑/↓" indicators
     on all screens.
  3. **`white`/`black` only with an explicit `backgroundColor`** (selection
     pills, e.g. `color="black" backgroundColor="cyan"`) — there the
     background is explicit, so it's fine.
  4. Accents (cyan/blue `#82bbff`/green/red/magenta/yellow, orange
     `#ff5a1f`) carry semantics and are visible on both backgrounds — they
     stay as-is.
- **Resize / fillers (100% width)**: on resize, Ink only re-runs Yoga on the
  existing tree — **it doesn't re-invoke components** and doesn't clear the
  screen, so static strings (e.g. `'─'.repeat(cols)` in `Divider`) stay at
  the old size and the terminal wraps them. That's why `App.jsx`'s `resize`
  handler: (1) writes `\x1b[2J\x1b[3J\x1b[H` (a full clear — no wrapped
  leftovers), (2) updates `termRows` **and** `termCols`, forcing a full
  re-render. This keeps dividers/fillers always at 100% of the current
  width, and Header recomputes the layout.
- **Anti-overflow (important!)**: Ink renders inline — if a frame exceeds
  the window height, it appends a copy ("duplication"). So: (1) long lines
  are truncated with `truncate-end` (full lines are revealed by log scroll
  or wrap mode `/wrap`; `LogPane` guards the row budget regardless), (2)
  lists are "windowed" via `window.js` (`windowList`) with a height computed
  from `termRows` and "↑/↓ more" indicators, (3) input/palette/screens are
  pinned to the bottom (the log fills the top). When changing layout, watch
  that the total height stays ≤ `termRows`.
- **The action zone always at the bottom, the log always above it (DO NOT
  break!)**: one rule for every mode — whatever the user is interacting
  with (input, slash palette, picker/form/conflicts/connect/loading
  screens) clings to the **bottom** of the window, and the log is context
  **above** it and never disappears. This keeps the eye from jumping
  top↔bottom on a mode switch (a deliberate redesign — slash used to hide
  the log, and screens were top-aligned).
  - **Slash doesn't hide the log** (`input`): the active layout (palette
    open) is **log > divider > hints > input**, the passive one (closed) is
    **log > divider > input** — the divider always sits right under the
    log, hints live in the action zone above the input (no filler, no
    bottom divider). `logWithPalette = paletteOpen && showLogWithPalette`
    (`showLogWithPalette` = `fillHeight` + there are entries + `logRows >=
    10`); then `LogPane` (rows `paletteLogRows = logRows - paletteCap`,
    `dim`) + `Divider` + `CommandPalette` (rows `paletteCap =
    min(filtered.length, logRows-4)`). Below the threshold (no log / low
    window) the palette takes the full height (`paletteMax`) and there's no
    divider. Divider and palette are **siblings** of the log's flex box
    (not nested inside it), so the log gives the palette exactly as many
    rows as it needs.
  - **Log as background = dimmed**: when the log is the backdrop for an
    open palette/screen, `LogPane` gets `dim` (dims the WHOLE log —
    `dimColor`, the same effect as `historic` for the previous session).
    It clearly says "this is context, the action is below". With the
    palette, a divider separates them; with screens (which have their own
    frame), the log clings DIRECTLY under the frame (no gap row — removed
    so the box doesn't "float").
  - **Screens at the bottom with the log above**: the helper
    `wrapAction(node)` in `App.jsx` wraps every overlay in
    `flexGrow=1`+`justifyContent="flex-end"`, and inserts `LogPane` (rows
    `ovLogRows`, `dim`) above it — no filler between the log and the frame.
    **This is a FUNCTION, not a component** — otherwise the Box gets a new
    identity on every render and React remounts the screen, losing pickers'
    `useState`. The budget is computed FROM DATA: `overlayNatural` (how many
    items + chrome), `ovRows = min(natural, overlayAvail)`, `ovMax =
    ovRows-4` (body), `ovLogRows = overlayAvail - ovRows`. Anti-overflow
    invariant: `ovLogRows + screen_height ≤ overlayAvail`. **The log above
    a screen is a filler, not a requirement**: we only show it when
    `ovLogRows >= 2` (1 row would be just the "↑ more" indicator with no
    content) — on a low window it disappears and the screen takes the full
    height (the overlay "overlaps" the spot left by the hidden header, see
    below). **`overlayAvail` MUST equal the ACTUAL height of the overlay's
    flex box** = `termRows - HEADER` (root `termRows` minus the header with
    its top divider). It's the only growing child of the root after the
    header, so any mismatch (e.g. the old `-2`) causes the too-short
    `justifyContent:flex-end` stack to land lower, leaving an empty row
    (gap) BETWEEN the header and the log. The second no-gap condition: the
    screen must render at exactly `ovRows` rows —`ConflictList` reserves a
    row for the "↑ more" indicator ONLY when windowing is actually
    happening (otherwise it shrank a card without needing to, and the
    screen came in shorter than the budget → a gap). `action-bottom.mjs`
    checks this (the `noTopGap` assertion: right below the header's divider
    there's log content, not a blank row).
  - Test: `node apps/cli/test/action-bottom.mjs` (picker+palette, log
    above, bottom=screen, no overflow; covers low windows with a
    compact/hidden header).
- **Header degradation on a low window + a "too small" screen
  (`layout.js`)**: the header yields space to content as `termRows` drops.
  `headerLayout({termRows, termCols, mode})` returns `{ mode, height,
  minRows }` with four tiers: `full` (logo, 8 / stacked 14 — only when
  `termRows>=16` and it fits) → `compact` (1 row "Liquid Flow │ ● Shop │
  Template │ ⚠ N", `Header` with the `compact` prop, plus the top divider =
  2) → `none` (header **hidden**: the overlay "overlaps" its spot — the
  terminal has no z-index, so we simply don't render it, along with the top
  divider) → `guard` (window too small). Which header variant is chosen is
  decided by `minBodyRows(mode)` = how many content rows BELOW the header
  a given mode needs (conflicts: 4 chrome + 1 card of 3 + footer;
  picker/connect/form: 4 chrome + 1 item; input: 2) — a light screen gets a
  nicer header than conflicts at the same height.
  **The guard has a GLOBAL floor, not per-mode (`appMinRows()`)**: the
  minimum height of the whole app = the requirement of the HEAVIEST screen
  (conflicts with bulk operations = **8**; root = `termRows`, so no "+1").
  Below that floor `guard` shows for EVERY mode (including idle `input`), so
  the "window too small" message doesn't wait to pop up until you enter a
  heavier screen mid-work. The `minRows` in the result is always this
  global floor (a consistent message). Above the floor, `none` always fits
  the current mode (floor = max need). Under `guard`, `App.jsx` renders a
  centered `WindowTooSmall` (PL/EN, `{rows}` = `minRows`) instead of a
  scrambled/duplicated view; it disappears on its own after `resize` (a full
  re-render). Tests: `apps/cli/src/layout.test.js` (logic + global floor),
  `Header.test.jsx` (compact variant). **There's no more `fillHeight`** —
  root is always `height={termRows}` (full height, no bottom margin line —
  the overlay box reaches the terminal's last row; in the alt screen with
  deferred wrap this is safe, and overflow is guarded by guard +
  windowing), overlays are always wrapped (`wrapAction`).
- **Filling the height (input at the bottom)**: root gets `height={termRows}`,
  and the log area in `input` mode has `flexGrow={1}` +
  `justifyContent="flex-end"` — the input sits stably at the bottom (the
  terminal's last row), and the log grows upward and fills the window (no
  hard limit; `logRows = termRows - HEADER - progress - 2`). **`HEADER` is
  now `headerLayout().height`** (not a constant) — it matches the ACTUAL
  height of the chosen header variant: too tall → a blank line above the
  log, too short → overflow. The layout rule (including no blank line) is
  checked by `node apps/cli/test/fill-height.mjs`.
- **Slash commands** (`commands.js`, `buildCommands(ctx)`): `/connect
  /templates /conflicts /git /open /clear /settings /exit(quit)`.
  `/connect` merges both scenarios (a list of saved shops **and** "add
  new") — there's no separate `/login`/`/shops`; it's a **dedicated
  `ConnectList` screen** (NOT `Picker`): shop list (↑/↓, Enter = connect) +
  a footer action row — Disconnect session / Add new connection / Remove
  shop (the old `/logout`/`/remove`), picked via ←/→ (and ↑/↓ in the same
  order; Disconnect only when connected, Remove only when there are saved
  shops). Render: `node apps/cli/test/connectlist-render.mjs`. `/settings`
  is a preferences menu: a log-wrap toggle (the old `/wrap`, the toggle
  pattern from `/git`) + a language picker (the old `/lang`). Typing `/`
  filters the palette; the startup list "Connect to a shop" opens
  automatically when disconnected, and `/` skips past it. Bulk operations
  (download/send all) aren't separate commands — they're the footer of the
  `/conflicts` screen (they only make sense when there are conflicts). You
  resolve a single file directly in the card's row (`←/→` picks the action,
  `Enter` executes — see `ConflictList` above). **Entering `/conflicts`
  first recomputes conflicts live** (`ctrl.recheckMismatches` — the same
  metadata query as the poll), so decisions are based on the shop's fresh
  state. The conflicts indicator sits in the header (next to the logo,
  doesn't push the layout around) and links to `/conflicts`. There's no
  `/refresh` — `SyncSession` recomputes conflicts on a background cycle
  (`POLL_MS`), catching changes on the shop's side.
