# Plan 018: Fix corrupted render of the `tooLarge` / `binary` conflict preview (CLI)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 66595db..HEAD -- apps/cli/src/components/DiffView.jsx apps/cli/src/commands.js apps/cli/src/layout.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `66595db`, 2026-07-01

## Why this matters

When a user opens the conflict preview (`/conflicts` → "Podgląd") for a file
that is too large to diff (e.g. `desktop1.min.css`) or is binary, the box
renders **corrupted** — the title and border fragment and the frame duplicates
(the classic Ink inline-overflow failure documented in `CLAUDE.md`). The user
sees garbled output instead of a clean "Plik za duży do podglądu" message and
can't tell whether the tool broke.

Two independent defects stack to cause this:

1. The title `<Text>` in the `binary` and `tooLarge` branches of `DiffView`
   lacks `wrap="truncate-end"` (the text branch has it), so a long file path
   wraps onto a second line.
2. The overlay height budget for a non-text preview is computed as 4 rows, but
   the `binary`/`tooLarge` box always renders 5 rows (border 2 + title 1 +
   message 1 + hint 1). The 1-row under-allocation overflows the terminal budget,
   and Ink responds by duplicating the frame.

Both must be fixed; either alone still corrupts on the failing case.

## Current state

Files:
- `apps/cli/src/components/DiffView.jsx` — the scrollable diff preview
  component. It has three early-return branches (`binary`, `tooLarge`) plus the
  main text render.
- `apps/cli/src/commands.js` — `runFileAction()` builds the preview and opens
  the diff overlay, passing a `lines` count used by the layout to size the box.
- `apps/cli/src/layout.js` — `naturalBodyRows()` turns that `lines` count into
  the overlay's row budget.

**Defect 1 — title not truncated in the non-text branches**
(`apps/cli/src/components/DiffView.jsx`, current lines ~70–88):

```jsx
  if (preview?.kind === 'binary') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>{title}</Text>
        <Text dimColor>{t.DiffBinary}</Text>
        <Text dimColor>{navHint}</Text>
      </Box>
    );
  }

  if (preview?.kind === 'tooLarge') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>{title}</Text>
        <Text dimColor>{t.DiffTooLarge}</Text>
        <Text dimColor>{navHint}</Text>
      </Box>
    );
  }
```

Compare with the text branch (current line ~132), which does it correctly:

```jsx
      <Text color="cyan" bold wrap="truncate-end">{title}</Text>
```

**Defect 2 — non-text preview reports 0 lines**
(`apps/cli/src/commands.js`, current lines ~186–195):

```jsx
  const runFileAction = (m, value, mm) => {
    if (value === 'preview') {
      withLoading(t.PreviewLoading, async () => {
        const preview = await ctrl.previewConflict(m.File, m.Type);
        // wysokość nakładki liczymy z RZECZYWISTYCH wierszy (po zwinięciu kontekstu),
        // nie z surowej długości diffu — duży plik z małą zmianą = kilka wierszy.
        const lines = preview?.kind === 'text' ? buildDiffRows(preview.diff, { context: 3 }).length : 0;
        openDiff({ title: tfmt(t.DiffTitle, { name: m.File.Name }), preview, lines });
      });
      return;
    }
```

How `lines` becomes the box budget (`apps/cli/src/layout.js`, current lines
~45–53):

```js
export function naturalBodyRows(mode) {
  switch (mode?.type) {
    ...
    case 'diff': return (mode.lines || 0) + 4;
    default: return minBodyRows(mode);
  }
}
```

So for a `tooLarge`/`binary` preview: `lines = 0` → `naturalBodyRows = 4`, but the
box renders **5** rows. The floor `minBodyRows('diff') === 5` (layout.js line ~31)
is already correct — only `naturalBodyRows` is short, and that's the value
`App.jsx` uses to decide overlay sizing/windowing.

Repo conventions that apply here:
- **Anti-overflow is a hard rule** (see `CLAUDE.md` → "Anty‑przepełnienie" and the
  `DiffView.jsx` header comment: "Zajmuje dokładnie `maxRows + 4` wierszy").
  Every overlay must render within its allocated row budget or Ink duplicates the
  frame.
- **Truncate long single-line text** with `wrap="truncate-end"` — the same fix the
  text branch already uses for its title.
- **No new i18n keys needed** — `t.DiffTooLarge` / `t.DiffBinary` already exist in
  both `pl` and `en` (`packages/core/src/translations.js`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests (all) | `npm test` | exit 0, all green |
| Tests (this component) | `npx vitest run apps/cli/src/components/DiffView.test.jsx` | all pass |
| Layout tests | `npx vitest run apps/cli/src/layout.test.js` | all pass |
| Render smoke (visual, optional) | `node apps/cli/test/action-bottom.mjs` | no overflow assertion failures |

There is **no** typecheck/lint script in this repo — `npm test` (Vitest) is the gate.

## Scope

**In scope** (the only files you should modify):
- `apps/cli/src/components/DiffView.jsx`
- `apps/cli/src/commands.js`
- `apps/cli/src/components/DiffView.test.jsx` (add assertions)

**Out of scope** (do NOT touch):
- `packages/core/src/diff.js` and `previewConflict` in `packages/core/src/syncEngine.js`
  — the preview *data* is correct; this is purely a render/sizing bug.
- `apps/cli/src/layout.js` — `naturalBodyRows` already does the right thing given a
  correct `lines` input; fix the input in `commands.js`, not the formula.
- `apps/desktop/**` — the desktop has its own preview (plan 012); a parallel fix
  there is a separate follow-up (see Maintenance notes).

## Git workflow

- Work directly on `main` (repo convention — see `CLAUDE.md`).
- Before committing: bump the patch version in **all three** `package.json`
  (root, `apps/cli/package.json`, `packages/core/package.json`) and add a
  `CHANGELOG.md` entry under a new `## [X.Y.Z] — 2026-07-01` heading with a
  `### Fixed` bullet.
- Commit message (Conventional Commits, English, **no `Co-Authored-By` footer**):
  `fix(cli): truncate title and size the too-large/binary diff preview to avoid overflow`

## Steps

### Step 1: Truncate the title in the `binary` and `tooLarge` branches

In `apps/cli/src/components/DiffView.jsx`, add `wrap="truncate-end"` to the title
`<Text>` in **both** the `binary` branch and the `tooLarge` branch, matching the
text branch:

```jsx
        <Text color="cyan" bold wrap="truncate-end">{title}</Text>
```

Leave the `t.DiffBinary` / `t.DiffTooLarge` / `navHint` lines unchanged (they are
short and already `dimColor`).

**Verify**: `grep -n 'wrap="truncate-end">{title}' apps/cli/src/components/DiffView.jsx`
→ **three** matches (binary, tooLarge, text branches).

### Step 2: Give non-text previews a correct row count

In `apps/cli/src/commands.js`, change the `lines` computation so a non-text
preview reports the single content line it actually renders (message row),
yielding `naturalBodyRows = 1 + 4 = 5` to match the box:

```jsx
        const lines = preview?.kind === 'text' ? buildDiffRows(preview.diff, { context: 3 }).length : 1;
```

(Only the trailing `: 0` becomes `: 1`.)

**Verify**: `grep -n "buildDiffRows(preview.diff, { context: 3 }).length : 1" apps/cli/src/commands.js`
→ exactly one match.

### Step 3: Add regression assertions to the component test

In `apps/cli/src/components/DiffView.test.jsx`, inside the
`describe('DiffView — warianty podglądu', ...)` block, extend the two existing
non-text tests (or add new `it` blocks) to assert the render fits and the title
does not wrap. Use a **long title** to reproduce the original bug, and
`renderFrame`-style width control is not required — the default 100-col frame is
enough to prove the title stays on one line. Model the structure on the existing
`'plik za duży — pokazuje komunikat DiffTooLarge'` test (lines ~25–30).

Add a test like:

```jsx
  it('tooLarge z długim tytułem — tytuł nie zawija, render mieści się w budżecie', () => {
    const longTitle = 'Podgląd: order/delivery-partials/very/deep/path/desktop1.min.css';
    const api = render(
      <DiffView title={longTitle} preview={{ kind: 'tooLarge' }} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    const lines = api.lastFrame().split('\n');
    // box = border(2) + tytuł(1) + komunikat(1) + hint(1) = 5 wierszy, bez zawinięcia tytułu
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(frame(api)).toContain(t.DiffTooLarge);
  });
```

Add the analogous assertion for `kind: 'binary'` (asserting `t.DiffBinary` and
`lines.length <= 5`).

**Verify**: `npx vitest run apps/cli/src/components/DiffView.test.jsx` → all pass,
including the two new/extended cases.

### Step 4: Full suite + version/changelog bump

Run the full gate, then bump versions and update the changelog (see Git workflow).

**Verify**: `npm test` → exit 0, all green.

## Test plan

- New/extended tests in `apps/cli/src/components/DiffView.test.jsx`:
  - `tooLarge` with a long title → frame is ≤ 5 lines (title did not wrap) and
    contains `t.DiffTooLarge`.
  - `binary` with a long title → frame is ≤ 5 lines and contains `t.DiffBinary`.
- Structural pattern to follow: the existing `'plik za duży — …'` and
  `'plik binarny — …'` tests in the same file.
- Verification: `npm test` → all pass, including the 2 new assertions.

## Done criteria

ALL must hold:

- [ ] `grep -n 'wrap="truncate-end">{title}' apps/cli/src/components/DiffView.jsx` → 3 matches
- [ ] `grep -n "context: 3 }).length : 1" apps/cli/src/commands.js` → 1 match
- [ ] `npx vitest run apps/cli/src/components/DiffView.test.jsx` → all pass
- [ ] `npm test` exits 0, fully green
- [ ] Patch version bumped in all three `package.json`; `CHANGELOG.md` has a new `### Fixed` entry
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 018 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The `DiffView.jsx` branches don't match the "Current state" excerpts (drift).
- `naturalBodyRows`/`minBodyRows` in `layout.js` no longer use `+4`/`5` as shown —
  the sizing contract changed and Step 2's arithmetic must be re-derived.
- After both fixes, a render test still shows a frame taller than the box budget —
  there may be a third contributor (e.g. `paddingY`); report the frame dump.

## Maintenance notes

- The rule "every overlay renders exactly within `naturalBodyRows`" is load-bearing
  for anti-overflow. If a future change adds a line to the `binary`/`tooLarge` box
  (e.g. a file-size hint), bump the non-text `lines` value in `commands.js` in the
  same commit.
- **Desktop parity follow-up (deferred):** the desktop conflict preview (plan 012,
  `apps/desktop/renderer`) may have an analogous "too large" state. It's outside
  Vitest and this plan's scope; verify it manually via `npm run dev` and file a
  separate desktop plan if it also corrupts on large/binary files.
- A reviewer should confirm the title truncates (not wraps) on a narrow terminal
  and that opening a preview for a `.min.css` no longer duplicates the frame.
