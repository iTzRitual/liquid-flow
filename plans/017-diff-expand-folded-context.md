# Plan 017: Let the user expand folded unchanged lines in the conflict diff preview (CLI)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 66595db..HEAD -- packages/core/src/diff.js apps/cli/src/components/DiffView.jsx packages/core/src/translations.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent; overlaps `DiffView.jsx` with plan 016 — if
  batched, apply both edits, they touch different regions)
- **Category**: dx / enhancement
- **Planned at**: commit `66595db`, 2026-07-01

## Why this matters

The conflict diff preview collapses long runs of unchanged lines into a single
static row: "⋯ N niezmienionych wierszy" (`buildDiffRows` with `context: 3`). This
keeps the changed lines from drowning in context — good default — but the user has
no way to *see* those hidden lines when they need the surrounding context to judge a
change. In the field the user asked to be able to reveal them. This also helps the
byte-identical case (plan 016): an all-context file currently shows a single fold
("⋯ 163 niezmienionych wierszy") with no way to inspect the actual content.

This plan adds a **Tab toggle** in the preview: press Tab to expand all folded
context (show every line with its line number), press again to collapse back to the
compact view. It's purely additive — the default view is unchanged, and the toggle
only appears when there's something folded to reveal.

## Current state

Files and roles:
- `packages/core/src/diff.js` — `buildDiffRows(diff, { context })` assigns line
  numbers and folds runs of unchanged context into `{ type: 'fold', count }` rows.
- `apps/cli/src/components/DiffView.jsx` — the scrollable preview; calls
  `buildDiffRows(preview.diff, { context: 3 })` once (memoized) and renders/scrolls
  within a fixed `maxRows` budget.
- `packages/core/src/translations.js` — `pl` / `en` string tables.

**`buildDiffRows` today** (`packages/core/src/diff.js`, current lines ~67–99):

```js
export function buildDiffRows(diff, { context = 3 } = {}) {
  if (!Array.isArray(diff)) return [];
  let a = 0;
  let b = 0;
  const items = diff.map((d) => {
    if (d.type === 'add') { b += 1; return { type: 'add', line: d.line, aLn: null, bLn: b }; }
    if (d.type === 'del') { a += 1; return { type: 'del', line: d.line, aLn: a, bLn: null }; }
    a += 1; b += 1; return { type: 'ctx', line: d.line, aLn: a, bLn: b };
  });

  // zaznacz wiersze do pokazania: każda zmiana + `context` linii w obie strony
  const keep = new Array(items.length).fill(false);
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'ctx') continue;
    const lo = Math.max(0, i - context);
    const hi = Math.min(items.length - 1, i + context);
    for (let j = lo; j <= hi; j++) keep[j] = true;
  }

  // złóż wiersze; ciągłe luki niezmienionych linii (≥2) → jeden fold
  const rows = [];
  let i = 0;
  while (i < items.length) {
    if (keep[i]) { rows.push(items[i]); i += 1; continue; }
    let j = i;
    while (j < items.length && !keep[j]) j += 1;
    const count = j - i;
    if (count >= 2) rows.push({ type: 'fold', count });
    else rows.push(items[i]);
    i = j;
  }
  return rows;
}
```

Note: folding is anchored on *changes*. A diff with **zero** changes (all `ctx`)
collapses to one fold regardless of `context` — so "expand" cannot be implemented by
raising `context`; it needs a mode that emits every `item` and no folds.

**`DiffView` today** — the memoized row build (`apps/cli/src/components/DiffView.jsx`,
current lines ~30–49):

```jsx
export default function DiffView({ title, preview, onCancel, maxRows = 8, t }) {
  const [scroll, setScroll] = useState(0);
  const isText = preview?.kind === 'text';
  const { rows, gutterW } = useMemo(() => {
    if (!isText) return { rows: [], gutterW: 1 };
    const built = buildDiffRows(preview.diff, { context: 3 });
    ...
  }, [isText, preview]);
```

Key handling (current lines ~60–66) and footer (current line ~138):

```jsx
  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (key.upArrow) { setScroll((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setScroll((s) => Math.min(maxScroll, s + 1)); return; }
    if (key.pageUp) { setScroll((s) => Math.max(0, s - Math.max(1, maxRows))); return; }
    if (key.pageDown) { setScroll((s) => Math.min(maxScroll, s + Math.max(1, maxRows))); return; }
  });
  ...
      <Text dimColor wrap="truncate-end">{summary} · {navHint}</Text>
```

Because `DiffView` already windows to `maxRows` and scrolls, expanding the row set
does **not** overflow the overlay box — it just gives more rows to scroll through.
So the overlay sizing in `commands.js` needs **no** change.

Repo conventions:
- **i18n hard rule**: new strings → keys in both `pl` and `en`.
- **No `color` on secondary text** — footer hints use `dimColor` (see the existing
  footer line). Keep that.
- Core logic modules get a `*.test.js` (`diff.js` already has `diff.test.js`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests (all) | `npm test` | exit 0, all green |
| Diff core tests | `npx vitest run packages/core/src/diff.test.js` | all pass |
| Component tests | `npx vitest run apps/cli/src/components/DiffView.test.jsx` | all pass |
| i18n parity | `npx vitest run packages/core/src/translations.test.js` | all pass |

`npm test` (Vitest) is the only gate.

## Scope

**In scope**:
- `packages/core/src/diff.js` (add a no-fold mode)
- `packages/core/src/diff.test.js` (test it)
- `apps/cli/src/components/DiffView.jsx` (Tab toggle + hint)
- `apps/cli/src/components/DiffView.test.jsx` (test the toggle)
- `packages/core/src/translations.js` (2 new keys × pl/en)

**Out of scope**:
- `apps/cli/src/commands.js` / `apps/cli/src/layout.js` — overlay sizing is fine;
  expanding scrolls within the fixed box, it does not resize it. Do not touch.
- The default `context: 3` behavior — the compact view must be unchanged when the
  user hasn't pressed Tab.

## Git workflow

- Work directly on `main`.
- Bump patch version in all three `package.json`; add a `CHANGELOG.md` `### Added`
  entry under a new `## [X.Y.Z] — 2026-07-01` heading.
- Commit (Conventional Commits, English, **no `Co-Authored-By`**):
  `feat(cli): expand folded context in the conflict diff preview (Tab)`

## Steps

### Step 1: Add a no-fold mode to `buildDiffRows`

In `packages/core/src/diff.js`, add a `fold` option (default `true`, preserving
current behavior). When `fold` is `false`, return every item with line numbers and
**no** fold rows. Insert the early return right after `items` is built, before the
`keep` array:

```js
export function buildDiffRows(diff, { context = 3, fold = true } = {}) {
  if (!Array.isArray(diff)) return [];
  let a = 0;
  let b = 0;
  const items = diff.map((d) => {
    if (d.type === 'add') { b += 1; return { type: 'add', line: d.line, aLn: null, bLn: b }; }
    if (d.type === 'del') { a += 1; return { type: 'del', line: d.line, aLn: a, bLn: null }; }
    a += 1; b += 1; return { type: 'ctx', line: d.line, aLn: a, bLn: b };
  });
  if (!fold) return items; // tryb rozwinięty: wszystkie wiersze, bez zwijania kontekstu

  // (reszta bez zmian: keep + assembly loop)
  ...
```

Update the function's doc comment to mention the `fold` option.

**Verify**: `npx vitest run packages/core/src/diff.test.js` → passes (new assertion
added in Step 4).

### Step 2: Add the two i18n keys (pl + en)

In `packages/core/src/translations.js`, add near the diff keys:

`pl`:
```js
  DiffShowContext: 'Tab pełny kontekst',
  DiffHideContext: 'Tab zwiń kontekst',
```

`en`:
```js
  DiffShowContext: 'Tab full context',
  DiffHideContext: 'Tab collapse context',
```

**Verify**: `npx vitest run packages/core/src/translations.test.js` → passes; the
i18n parity self-check (`node -e "…"` from plan 016 Step 1) prints
`untranslated: []`.

### Step 3: Add the Tab toggle to `DiffView`

In `apps/cli/src/components/DiffView.jsx`:

1. Add an `expanded` state next to `scroll`:
   ```jsx
   const [scroll, setScroll] = useState(0);
   const [expanded, setExpanded] = useState(false);
   ```

2. Compute whether there is anything foldable (so the hint only shows when useful).
   In the `useMemo`, build with `fold: !expanded` and also derive `collapsible`:
   ```jsx
   const { rows, gutterW, collapsible } = useMemo(() => {
     if (!isText) return { rows: [], gutterW: 1, collapsible: false };
     const built = buildDiffRows(preview.diff, { context: 3, fold: !expanded });
     const collapsible = buildDiffRows(preview.diff, { context: 3 }).some((r) => r.type === 'fold');
     // ... existing sanitize/dedent/gutter logic on `built` ...
     return { rows: dedented, gutterW: ..., collapsible };
   }, [isText, preview, expanded]);
   ```
   (Add `expanded` to the dependency array. `collapsible` is computed from the
   always-folded build so it doesn't change when `expanded` flips.)

3. Handle Tab in `useInput` (reset scroll because the row set changes):
   ```jsx
   if (key.tab && collapsible) { setExpanded((e) => !e); setScroll(0); return; }
   ```

4. Add the toggle hint to the footer line, before `navHint`, only when collapsible:
   ```jsx
   const toggleHint = collapsible ? `${expanded ? t.DiffHideContext : t.DiffShowContext} · ` : '';
   ...
   <Text dimColor wrap="truncate-end">{summary} · {toggleHint}{navHint}</Text>
   ```

**Verify**: `npx vitest run apps/cli/src/components/DiffView.test.jsx` → existing
tests pass (add the new one in Step 4).

### Step 4: Tests

- **`packages/core/src/diff.test.js`**: `buildDiffRows(diff, { fold: false })`
  returns no `fold` rows and one row per input line, with line numbers. Use a diff
  with a change plus ≥3 trailing ctx lines (which would fold at default). Assert the
  result has `rows.filter(r => r.type === 'fold').length === 0` and
  `rows.length === diff.length`.
- **`apps/cli/src/components/DiffView.test.jsx`**: model on
  `'numer linii w rynnie + zwijanie długiego kontekstu'` (which already builds a
  diff that folds). Render it, assert the frame contains `t.DiffShowContext`
  (toggle offered) and `'niezmienionych wierszy'` (folded). Then `await press(api.stdin, keys.tab)`
  and assert the frame now contains one of the previously-hidden ctx lines (e.g.
  `'ctx 5'`) and no longer contains `'niezmienionych wierszy'`. Add `tab` to the
  `keys` helper if it's missing (`test/helpers/ink.js` — check first; the Tab
  sequence is `'\t'`).

**Verify**: `npm test` → exit 0, all green, including the 2 new tests.

## Done criteria

ALL must hold:

- [ ] `buildDiffRows(diff, { fold: false })` emits no fold rows and one row per line
      (test proves it); default behavior unchanged (existing `diff.test.js` passes)
- [ ] i18n parity self-check prints `untranslated: []`
- [ ] Pressing Tab in a folded preview reveals hidden context lines; pressing again
      collapses (component test proves the reveal)
- [ ] The Tab hint appears only when there is something folded (`collapsible`)
- [ ] `npm test` exits 0, fully green
- [ ] Patch version bumped in all three `package.json`; `CHANGELOG.md` updated
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 017 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt doesn't match the live code (drift).
- `key.tab` does not fire in `useInput` under `ink-testing-library` (some setups
  swallow Tab). If the component test can't trigger it via `'\t'`, report — do not
  silently switch to a different key without confirming it doesn't collide with
  existing bindings.
- Expanding a large diff causes the overlay to overflow/duplicate the frame (it
  should not, since `DiffView` clamps to `maxRows`) — if it does, report the frame
  dump; the windowing math may have regressed.

## Maintenance notes

- The overlay box is sized once at open time (`commands.js` passes the folded
  `lines` count to the layout). Expanding scrolls within that fixed box — correct
  and intentional. If a future change makes the box grow on expand, it must re-check
  the anti-overflow budget (`naturalBodyRows`).
- `collapsible` is intentionally computed from the always-folded build so the hint's
  presence is stable across toggles.
- **Desktop parity follow-up (deferred):** the desktop preview (plan 012) uses the
  same `buildDiffRows`; the new `fold` option is now available there too. An
  "expand context" affordance in the desktop UI is a small additive follow-up
  (matches the "desktop is a draft, keep it minimal/additive" constraint).
- A reviewer should confirm the compact (default) view is pixel-identical to before
  for a diff that folds — the enhancement must not change the default.
