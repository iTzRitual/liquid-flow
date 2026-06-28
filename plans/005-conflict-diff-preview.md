# Plan 005: Show a content diff before resolving a conflict (download vs upload)

> **Executor instructions**: This is a **design/spike plan** with one concrete,
> shippable core deliverable (a `previewConflict` API + a tiny diff util) and a
> scoped CLI surface. Follow it step by step. Run every verification command and
> confirm the expected result before moving on. If a "STOP condition" occurs,
> stop and report — do not improvise. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 06c297b..HEAD -- packages/core/src/syncEngine.js packages/core/src/controller.js apps/cli/src/commands.js apps/cli/src/components/ConflictList.jsx`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1 (top direction pick)
- **Effort**: M
- **Risk**: LOW (purely additive; no change to existing sync/conflict logic)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `06c297b`, 2026-06-28

## Why this matters

The scariest moment in any sync tool is the conflict prompt: "which side wins?"
Today Liquid Flow answers that with **timestamps alone** — the user picks
`download` or `upload` without ever seeing what actually changed, and the loser
is overwritten irreversibly on one side. The remote file content is already one
SOAP call away (`liquidFilesGet`, used today in `_download`) and the local copy
is on disk, so a "preview the diff" capability is **pure addition over data the
engine already has**. This is the single highest-trust improvement available to
the conflict flow.

## Current state

The facts you need, inlined.

- **`apps/cli/src/commands.js`** — builds the `/conflicts` screen. The card data
  passed to the UI is only name + two timestamps + a "which side is newer" hint;
  **no content** is ever surfaced:
  ```js
  // commands.js:206-232 (renderConflicts)
  const files = mm.map((m) => {
    const { options, initial } = fileOptions(m);
    return { name: m.File.Name, meta: metaLine(m), note: noteLine(m), options, initial, m };
  });
  // ...
  openConflicts({ title: t.FileConflicts, files, bulk,
    onAction: (value, file) => runFileAction(file.m, value, mm), ... });
  ```
  The per-file actions are decided by `fileOptions(m)` (commands.js:152-175):
  Timestamp → `download`/`upload`; LocalMissing → `download`/`removeRemote`;
  RemoteMissing → `upload`/`removeLocal`.

- **`packages/core/src/syncEngine.js`** — `_download` already fetches remote
  content; reuse this call shape for the preview:
  ```js
  // syncEngine.js:381-390 (_download)
  async _download(file) {
    const list = await this.client.liquidFilesGet({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name });
    const f = list[0];
    if (!f) return;
    // f.Template is a Buffer (decoded base64) — this is the remote content
    ...
  }
  ```
  Local content is read via `store.localFilePath(this.shopName, this.templateId, file.Mode, file.Name)` then `fs.readFileSync`. Image/binary files are
  classified by `isImage(name)` (syncEngine.js:31, `IMAGE_EXT` at line 23).
  `MismatchType` (syncEngine.js:25) has `Timestamp | LocalMissing | RemoteMissing`.

- **`packages/core/src/controller.js`** — thin delegations to the session, e.g.:
  ```js
  // controller.js:339-349
  async recheckMismatches() {
    if (!this.state.session) return [];
    return this.state.session.refreshMismatches({ silent: true });
  }
  async runCommand({ comm, file, type }) {
    if (!this.state.session) throw new Error(this.t.NoActiveSyncSession);
    const result = await this.state.session.command(comm, file, type);
    this.emit('mismatches', result);
    return result;
  }
  ```
  Add `previewConflict` next to these, in the same delegating style.

- **`apps/cli/src/App.jsx`** — overlay model. `mode.type` is one of
  `input | picker | form | conflicts | connect | loading` (App.jsx:25-26).
  Overlays are opened via `ctx` helpers (`openPicker`, `openForm`,
  `openConflicts`, `openConnect`, `withLoading`) and rendered at the bottom via
  `wrapAction(node)` (App.jsx:258, 286-309) with the dimmed log above. A new
  read-only "diff viewer" overlay would be a new `mode.type === 'diff'` rendered
  through `wrapAction`, opened by a new `ctx.openDiff(data)` helper — model it on
  how `openConflicts` is defined (App.jsx:98-108) and rendered (App.jsx:301).

- **`apps/cli/src/components/ConflictList.jsx`** — the conflict screen component.
  Each card renders a name + action buttons row (always), plus `meta`/`note`
  lines that degrade at low height. Navigation: `↑/↓` between cards, `←/→` choose
  action, `Enter` runs, `Esc` cancels (ConflictList.jsx:58-72). **Read the long
  header comment (lines 5-35) before touching this file — the fixed-height region
  math is load-bearing and has its own test.**

### Conventions to follow

- **i18n is mandatory** (CLAUDE.md hard rule): every user-visible string gets a
  key in **both** the `pl` and `en` flat tables in
  `packages/core/src/translations.js`. Model new keys on the existing git block,
  e.g. `GitPushToOrigin` at translations.js:232 (pl) / :484 (en). Never hardcode
  PL/EN text in `commands.js`, `syncEngine.js`, or components.
- **No new runtime dependencies** — the repo hand-writes small utilities
  (spinner, window math) rather than pulling packages. The diff algorithm is a
  small vendored function, not a dep.
- **Logs use descriptors**: `logInfo(tmsg('Key', params))`, not literal strings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests (gate) | `npm test` | exit 0, all green (~189 at baseline, plus your new tests) |
| Single file | `npm test -- diff` or `npm test -- syncEngine` | matched tests pass |
| i18n parity | `node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;console.log('untranslated:',Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k])))})"` | `untranslated: []` |
| CLI render smoke | `script -q /dev/null node apps/cli/bin/liquidflow.js` (FORCE_COLOR=3; Ctrl-… won't exit, close the terminal/pane) | renders without frame doubling |

There is **no** typecheck/lint script — `npm test` is the gate.

## Scope

**In scope** (create/modify only these):
- `packages/core/src/diff.js` (create) — tiny LCS line-diff utility.
- `packages/core/src/diff.test.js` (create).
- `packages/core/src/syncEngine.js` — add `previewConflict(file)`.
- `packages/core/src/syncEngine.command.test.js` or
  `syncEngine.watcher.test.js` — add preview tests (pick whichever already
  constructs a `SyncSession` with a mock client; see Test plan).
- `packages/core/src/controller.js` — add `previewConflict` delegation.
- `packages/core/index.js` — export `diff` helpers **only if** other layers need
  them (the CLI imports from `@liquidflow/core`; verify the barrel first).
- `packages/core/src/translations.js` — new keys in `pl` **and** `en`.
- `apps/cli/src/commands.js` — wire a "preview" affordance into the conflict flow.
- `apps/cli/src/App.jsx` — new `diff` overlay helper + render branch (if you go
  the dedicated-overlay route — see Step 4).
- `apps/cli/src/components/DiffView.jsx` (create, if dedicated overlay).
- `apps/cli/src/components/DiffView.test.jsx` (create, if dedicated overlay).

**Out of scope** (do NOT touch):
- `apps/desktop/**` — entirely out of scope for this effort.
- The existing conflict-resolution logic in `syncEngine.command()` /
  `_download` / `_upload` — preview is read-only and must not change how
  download/upload behave.
- The fixed-height region math in `ConflictList.jsx` — if you can add preview
  **without** altering that math, do; if it seems to require reworking it, that's
  a STOP condition (report instead).
- Binary/image diffing — explicitly deferred (see Step 1).

## The spike deliverable

Because this is a direction spike, produce **two things**:

1. A short design note appended to this file under "## Spike outcome" (≤ 30
   lines): which CLI presentation you chose and why (Step 4), how binary/large
   files are handled, and any follow-up you deferred.
2. The working vertical slice defined in the steps below: core diff + preview API
   (fully built & tested) and a **minimal** CLI diff view reachable from
   `/conflicts`.

Do **not** gold-plate the UI (no side-by-side, no syntax highlighting) — the goal
is to prove the flow end-to-end and lock the core API. Fancier rendering is
explicit follow-up.

## Steps

### Step 1: Core diff utility (`packages/core/src/diff.js`)

Write a small, dependency-free line diff. Recommended shape:

```js
// Minimal LCS-based line diff. Returns an array of { type, line } where
// type ∈ {'ctx','add','del'} ('ctx' = unchanged context). Text only — callers
// must pre-filter binary/image content.
export function lineDiff(aText, bText) { /* LCS over split('\n') */ }

// Convenience: a compact unified-style summary { added, removed, hunks }.
export function diffSummary(aText, bText) { /* counts + lineDiff */ }
```

Keep it under ~60 lines. Treat input as UTF-8 strings; the caller decodes
Buffers. Do not attempt to be `git diff`-identical — LCS line granularity is
enough for "see what changed."

**STOP** if a file exceeds a sane size for in-memory diff (define a constant,
e.g. `MAX_DIFF_BYTES = 256 * 1024`); return `{ tooLarge: true }` rather than
diffing megabytes.

**Verify**: `npm test -- diff` → new `diff.test.js` passes.

### Step 2: `SyncSession.previewConflict(file)` (core)

Add a method that, given a mismatch `File` (`{ TemplateId, Mode, Name }`) and
optionally its `Type`, returns a structured preview:

```js
// Returns one of:
//   { kind: 'binary', side: 'both'|'localOnly'|'remoteOnly' }     // images / non-text
//   { kind: 'tooLarge' }
//   { kind: 'text', local, remote, diff }   // diff from lineDiff(local, remote)
// For LocalMissing → local = null (remote-only); RemoteMissing → remote = null.
async previewConflict(file) { ... }
```

- Remote content: `const f = (await this.client.liquidFilesGet({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name }))[0]; const remoteBuf = f?.Template || null;`
- Local content: read `store.localFilePath(this.shopName, this.templateId, file.Mode, file.Name)` with `fs.readFileSync`, guarding `fs.existsSync`.
- If `isImage(file.Name)` or either buffer contains a NUL byte → `kind: 'binary'`.
- Decode text buffers with `.toString('utf8')`, run `lineDiff`.
- **Read-only**: must not write files, touch meta, or stop/start the watcher.

**Verify**: `npm test -- syncEngine` → new preview tests pass.

### Step 3: `Controller.previewConflict` delegation

Mirror `recheckMismatches`/`runCommand` (controller.js:339-349):

```js
async previewConflict(file) {
  if (!this.state.session) return null;
  return this.state.session.previewConflict(file);
}
```

**Verify**: `npm test -- controller` stays green (add a delegation test if the
existing `controller.test.js` pattern makes it cheap; otherwise covered via the
session tests).

### Step 4: CLI preview affordance (DESIGN DECISION — pick one, record it)

Two viable presentations. **Investigate both briefly, implement the simpler one,
and record the choice in "## Spike outcome".**

- **Option A (recommended): a dedicated read-only `diff` overlay.** Add a third
  per-card action `preview` in `fileOptions` (commands.js:152-175) for `Timestamp`
  conflicts (and a "view" for the missing-on-one-side cases). Selecting it calls
  `withLoading(...)` → `ctrl.previewConflict(file)` → `ctx.openDiff({ title, file, preview })`.
  `openDiff` sets `mode.type='diff'`; render a new `DiffView.jsx` through
  `wrapAction` (model on `openConflicts` at App.jsx:98-108 / render at :301).
  `DiffView` is a scrollable text pane: `+`/`-`/context lines, green/red accents
  (reuse the LogPane color convention — default fg for context, `green`/`red` for
  add/del), `Esc` returns to the conflict list. Reuse the windowing helper in
  `apps/cli/src/window.js` for scrolling.
- **Option B: inline expansion** of the focused card in `ConflictList.jsx`. Lower
  navigation cost but collides with the fixed-height region math (out of scope to
  rework). Only choose this if Option A proves worse in practice.

Either way: **adding `preview` must not change the default action** — the safe
default selection (never a destructive action) is asserted by
`commands.test.js`; keep `initial` pointing at the same non-destructive option.

**Verify**:
- `npm test` → fully green, including `commands.test.js` (safe-default assertion
  still holds) and any new `DiffView.test.jsx`.
- `node apps/cli/test/action-bottom.mjs` (if you added a `diff` overlay, confirm
  it obeys the same bottom-anchored/no-overflow layout as other overlays; extend
  the smoke script or add a sibling if needed).

### Step 5: i18n + docs

- Add keys (titles, action labels like `ActionPreviewShort`, "binary — no
  preview", "file too large", `+N −M` summary) to **both** `pl` and `en` in
  `translations.js`.
- Update `CHANGELOG.md` (new version section — see CLAUDE.md versioning rule:
  bump patch in all three `package.json` files) and add a one-line note to the
  `/conflicts` description in `README.md` if the flow gains a visible "preview"
  step.

**Verify**: the i18n parity one-liner prints `untranslated: []`.

## Test plan

- **`diff.test.js`** (new): identical inputs → all `ctx`; pure addition; pure
  deletion; mixed change; `tooLarge` over the byte cap; empty-string vs content.
  Model structure on `xml.test.js` (plain unit test, no fixtures).
- **`syncEngine` preview tests** (new, in whichever file already builds a
  `SyncSession` with a mock client — see `syncEngine.command.test.js`): inject a
  client whose `liquidFilesGet` returns a known `Template` Buffer; seed a local
  file via `store.writeLocalFile`; assert `previewConflict` returns `kind:'text'`
  with the expected `diff`. Cases: Timestamp (both sides), LocalMissing
  (remote-only), RemoteMissing (local-only), image name → `kind:'binary'`. Use
  the mock-client injection pattern (`new SyncSession(shop, tpl, { client })`)
  documented in CLAUDE.md and used across `syncEngine.*.test.js`.
- **`DiffView.test.jsx`** (new, if Option A): render with a known diff, assert
  add/del lines appear; `Esc` calls `onCancel`. Model on
  `ConflictList.test.jsx` (uses `ink-testing-library` + `test/helpers/ink.js`).
- Verification: `npm test` → all pass, including the new tests.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0; new `diff.test.js` + preview tests exist and pass.
- [ ] `node -e "...untranslated..."` (command above) prints `untranslated: []`.
- [ ] `previewConflict` exists on both `SyncSession` and `Controller` and is
      read-only (no writes/meta/watcher side effects — asserted by a test).
- [ ] From `/conflicts`, a user can view what differs before choosing
      download/upload (manual smoke via `script -q /dev/null node apps/cli/bin/liquidflow.js`
      against a seeded shop — or, if no live shop, the `DiffView.test.jsx` proves
      the render).
- [ ] The default (pre-selected) conflict action is unchanged and never
      destructive (`commands.test.js` green).
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] "## Spike outcome" section appended; `plans/README.md` row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift).
- Adding the preview appears to require reworking the fixed-height region math in
  `ConflictList.jsx` (out of scope).
- `liquidFilesGet` does not return decoded `Template` Buffers as the excerpt
  assumes (the contract changed).
- A preview test reveals `previewConflict` causing any write/meta/watcher side
  effect you can't eliminate.
- You find yourself adding a runtime dependency for diffing — the util must be
  hand-written.

## Maintenance notes

- If DIR-02 (plan 006) lands, pulled changes surface as conflicts — this diff
  view is what makes resolving them safe. Keep the preview path working against
  `Timestamp` conflicts specifically.
- A reviewer should scrutinize: that preview never mutates state; that binary/
  large-file guards actually fire; and that i18n parity holds.
- Deferred on purpose: side-by-side and syntax-highlighted rendering, desktop
  parity, and diffing for the `removeLocal`/`removeRemote` choices (preview is
  most valuable for the two-sided `Timestamp` case).

## Spike outcome

**Chosen: Option A — dedicated read-only `diff` overlay.**

A third "Preview" button (`t.ActionPreviewShort`) is added to every conflict card
option set (at the end, so `initial` is unchanged and the safe-default assertion
in `commands.test.js` still passes). Selecting it opens a `withLoading` spinner
that fetches remote content via `SyncSession.previewConflict`, then opens a new
`DiffView` overlay through `ctx.openDiff`. Esc from the diff view returns to the
conflict list (the conflicts screen is stored as `parent` via `pendingParentRef`).

Option B (inline card expansion) was ruled out immediately: it would have required
touching the fixed-height region math in `ConflictList.jsx`, which is a stated
STOP condition.

**Binary / large-file handling:**
- Files whose extension is in `IMAGE_EXT` → `{ kind:'binary', side:'both' }` (no
  SOAP fetch attempted for images).
- Buffers that contain a NUL byte → `{ kind:'binary', side }` (covers compiled
  CSS, minified JS with embedded binary data, etc.).
- Combined text length > 256 KB → `{ kind:'tooLarge' }` (returns before
  allocating the LCS O(m×n) matrix).
- All three cases render a one-line dimColor fallback message in `DiffView`
  instead of crashing or showing garbage.

**Readability follow-up (done after first ship, on user feedback):**
- **Tab expansion** — leading tabs in nested templates made Ink mis-measure
  widths (tab = 1 col to Ink, up to 8 in the terminal), so lines never truncated
  and wrapped into a diagonal staircase. Tabs → 2 spaces fixes measurement.
- **Dedent** — strip the common leading indentation of visible content so deeply
  nested tags shift left and the actual tag shows (with `truncate-end`, which
  keeps the left of a line, otherwise you'd see only whitespace).
- **Line-number gutter** — dim, right-aligned (local # for `-`, remote # for `+`/ctx).
- **Context folding** — `buildDiffRows(diff, { context: 3 })` keeps ±3 lines
  around each change and collapses the rest into `⋯ N unchanged lines`, so the
  change isn't lost in a sea of white context lines.

**Deferred:**
- Side-by-side / syntax-highlighted rendering.
- Desktop (`apps/desktop`) parity — the `Controller.previewConflict` API is
  already wired; only the renderer UI is missing.
- Diff for `removeLocal`/`removeRemote` choices (show one-sided content view).
- Horizontal scrolling for lines longer than the terminal (currently truncated).
