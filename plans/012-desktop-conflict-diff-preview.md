# Plan 012: Desktop shows a content diff before resolving a conflict

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 49dbf68..HEAD -- apps/desktop/electron/main.js apps/desktop/electron/preload.cjs apps/desktop/renderer/src/components/ConflictsPanel.jsx apps/desktop/renderer/src/lib/utils.js packages/core/src/syncEngine.js packages/core/src/diff.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (high within P2 — prevents blind overwrites)
- **Effort**: M
- **Risk**: LOW (purely additive: a read-only preview; resolving conflicts is unchanged)
- **Depends on**: none (independent of plans 011/013/014)
- **Category**: migration (desktop ↔ core parity) / UX
- **Planned at**: commit `49dbf68`, 2026-06-29

## Why this matters

On desktop, the conflicts panel lets the user **Download** (remote → local) or **Upload**
(local → remote) a conflicting file, but gives no way to see *what actually differs* first.
Resolving a conflict is therefore a blind overwrite — easy to lose work. The CLI already has
this: a scrollable, colorized line-diff preview (plan 005, merged). The core method
`SyncSession.previewConflict()` and the pure diff engine `packages/core/src/diff.js` already
exist; the diff i18n keys already exist in both `pl` and `en`. This plan surfaces the same
preview on desktop as a read-only dialog. It changes nothing about how conflicts are
resolved — it only adds a "Podgląd" (Preview) button and a dialog.

## Current state

Files involved and their roles:

- `apps/desktop/electron/main.js` — Electron main; `handlers` map routes IPC method names to
  `Controller` calls. **The main process runs in Node and may import `@liquidflow/core`** (it
  already imports `Controller`).
- `apps/desktop/electron/preload.cjs` — exposes `window.api`.
- `apps/desktop/renderer/src/components/ConflictsPanel.jsx` — the conflicts list UI.
- `apps/desktop/renderer/src/components/ui/dialog.jsx` — shadcn dialog (exists).
- `apps/desktop/renderer/src/lib/utils.js` — renderer helpers (`cn`, `fmtDate`).
- `packages/core/src/syncEngine.js` — has `previewConflict` (read-only reference).
- `packages/core/src/diff.js` — pure `buildDiffRows` (read-only reference).
- `packages/core/src/controller.js` — has `previewConflict(file, type)` delegating to the
  session (read-only reference).

**Why the renderer cannot diff for itself**: the renderer is a sandboxed browser context and
cannot `import '@liquidflow/core'` (the barrel pulls in `store.js`/`git.js` which use
`node:fs`). Therefore the **main process** computes the display rows via `buildDiffRows` and
ships them to the renderer ready to paint. The renderer stays "dumb".

`controller.previewConflict` (read-only — confirm, do not edit),
`packages/core/src/controller.js:365`:
```js
  async previewConflict(file, type) {
    if (!this.state.session) return null;
    return this.state.session.previewConflict(file, type);
  }
```

`SyncSession.previewConflict` return shapes (read-only),
`packages/core/src/syncEngine.js:460+`:
```js
  // returns one of:
  //   { kind: 'binary', side: 'both' | 'remoteOnly' | 'localOnly' }
  //   { kind: 'tooLarge' }
  //   { kind: 'text', local, remote, diff }     // diff = raw line-diff array
```

`buildDiffRows(diff, { context })` (read-only), `packages/core/src/diff.js:67`, returns an
array of:
```
{ type: 'ctx'|'add'|'del', line, aLn, bLn }   // aLn = local line no, bLn = remote line no (one is null)
{ type: 'fold', count }                        // N collapsed unchanged lines
```

Reference renderer (the CLI's terminal diff — **do not copy verbatim**, it uses Ink; mirror
its *logic* in HTML/Tailwind): `apps/cli/src/components/DiffView.jsx`. Key behaviors to mirror:
`type==='add'` → green `+`, `type==='del'` → red `-`, `type==='ctx'` → muted, `type==='fold'`
→ `t.DiffFold` with the count, a line-number gutter, and a `+A −R` summary footer.

Current `ConflictsPanel.jsx` action button group per conflict (the part you extend), verbatim:
```jsx
            <div className="flex shrink-0 gap-2">
              {(m.Type === 'Timestamp' || m.Type === 'LocalMissing') && (
                <ConfirmButton variant="outline" onConfirm={() => cmd({ comm: 'download', file: m.File })} confirmLabel={t.Download}>
                  <Download className="h-4 w-4" /> {t.Download}
                </ConfirmButton>
              )}
              {(m.Type === 'Timestamp' || m.Type === 'RemoteMissing') && (
                <ConfirmButton variant="outline" onConfirm={() => cmd({ comm: 'upload', file: m.File, type: m.Type })} confirmLabel={t.Upload}>
                  <Upload className="h-4 w-4" /> {t.Upload}
                </ConfirmButton>
              )}
              ...delete buttons...
            </div>
```
and the top of the component:
```jsx
export default function ConflictsPanel() {
  const { t, api, call, mismatches } = useApp();
  ...
  const cmd = (data) => call(() => api.runCommand(data));
```
and the imports:
```jsx
import { Download, Upload, Trash2, CheckCircle2, ArrowDownToLine, ArrowUpFromLine, FileWarning } from 'lucide-react';
```

### i18n keys (already present in both `pl` and `en` — do NOT add any)

```
grep -nE "DiffTitle:|DiffBinary:|DiffTooLarge:|DiffSummary:|DiffNoChanges:|DiffFold:|ActionPreviewShort:|PreviewLoading:" packages/core/src/translations.js
```
Expected: each key appears **twice** (pl + en). Meanings:
- `ActionPreviewShort` = "Podgląd" / "Preview" (button label)
- `PreviewLoading` = "Ładowanie podglądu…" / "Loading preview…"
- `DiffTitle` = "Podgląd: {name}" / "Preview: {name}" (has a `{name}` token → use `fmt`)
- `DiffBinary` = "Plik binarny — brak podglądu" / "Binary file — no preview available"
- `DiffTooLarge` = "Plik za duży do podglądu" / "File too large to preview"
- `DiffSummary` = "+{added} −{removed}" (tokens → use `fmt`)
- `DiffNoChanges` = "Brak różnic" / "No differences"
- `DiffFold` = "⋯ {count} niezmienionych wierszy" (token → use `fmt`)

### Repo conventions to match

- Token interpolation in the renderer uses the `fmt(str, params)` helper (Step 1) — the
  renderer cannot import `tfmt` from core.
- Dialogs use the shadcn `Dialog*` components (see `dialog.jsx` and `ConfirmButton.jsx`).
- Comments in Polish; all user-facing strings via `t.<Key>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Drift check | `git diff --stat 49dbf68..HEAD -- <in-scope paths>` | empty, or re-verify excerpts |
| Renderer compiles | `npm run build:renderer --workspace @liquidflow/desktop` | exit 0, no error |
| Regression guard | `npm test` | exit 0, all green |
| Bridge wired | `grep -n "sync.previewConflict" apps/desktop/electron/main.js apps/desktop/electron/preload.cjs` | two matches |
| Manual smoke | `npm run dev` | see "Manual smoke" |

The desktop is not covered by Vitest; `npm test` is a regression guard, the renderer build is
the compile gate, and the manual smoke is the functional check.

## Scope

**In scope**:
- `apps/desktop/electron/main.js` (add 1 handler that calls `previewConflict` + `buildDiffRows`)
- `apps/desktop/electron/preload.cjs` (add 1 `window.api` method)
- `apps/desktop/renderer/src/components/ConflictsPanel.jsx` (add Preview button + dialog state)
- `apps/desktop/renderer/src/components/DiffDialog.jsx` (**create** — the diff renderer)
- `apps/desktop/renderer/src/lib/utils.js` (add `fmt` helper — idempotent; skip if present)
- `package.json`, `apps/cli/package.json`, `packages/core/package.json` (version bump — Step 6)
- `CHANGELOG.md` (Step 6)

**Out of scope**:
- `packages/core/**` — `previewConflict` and `buildDiffRows` already exist; no change needed.
- `packages/core/src/translations.js` — all keys exist.
- Conflict **resolution** logic (download/upload/delete) — unchanged.
- Any GitPanel / SyncView change.

## Git workflow

Commit directly to `main`; bump patch version in root + `apps/cli` + `packages/core`
`package.json` (not `apps/desktop`) + a `CHANGELOG.md` entry (see `CLAUDE.md`). Conventional
Commits, English, no `Co-Authored-By` footer. Suggested message:
`feat(desktop): preview conflict diff before resolving`. **Do NOT `git push`.**

## Steps

### Step 1: Ensure the `fmt` interpolation helper exists (idempotent)

In `apps/desktop/renderer/src/lib/utils.js`, if there is no `export function fmt`, add after
`fmtDate`:
```js
// Podstawienie tokenów {name} w stringach i18n (renderer nie importuje tfmt z core).
export function fmt(str, params = {}) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}
```
**Verify**: `grep -n "export function fmt" apps/desktop/renderer/src/lib/utils.js` → one match.

### Step 2: Bridge `previewConflict` in the main process (compute rows there)

In `apps/desktop/electron/main.js`, add this handler to the `handlers` map, near the
`'sync.command'` line:
```js
    'sync.previewConflict': async (data) => {
      const p = await ctrl.previewConflict(data && data.file, data && data.type);
      if (p && p.kind === 'text') {
        const { buildDiffRows } = await import('@liquidflow/core');
        const added = p.diff.filter((d) => d.type === 'add').length;
        const removed = p.diff.filter((d) => d.type === 'del').length;
        return { kind: 'text', rows: buildDiffRows(p.diff, { context: 3 }), added, removed };
      }
      return p; // { kind:'binary', ... } | { kind:'tooLarge' } | null
    },
```
This keeps the renderer free of any core import. `buildDiffRows` is a named export of
`@liquidflow/core` (see `packages/core/index.js`).

**Verify**: `grep -n "sync.previewConflict" apps/desktop/electron/main.js` → one match.

### Step 3: Expose it on `window.api` in preload

In `apps/desktop/electron/preload.cjs`, in the "synchronizacja" block (near `runCommand`),
add:
```js
  previewConflict: (data) => invoke('sync.previewConflict', data),
```
**Verify**: `grep -n "previewConflict" apps/desktop/electron/preload.cjs` → one match.

### Step 4: Create the `DiffDialog` renderer component

Create `apps/desktop/renderer/src/components/DiffDialog.jsx` with this content:
```jsx
import React from 'react';
import { useApp } from '../App.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmt } from '@/lib/utils';

// Read-only podgląd różnic przed rozwiązaniem konfliktu. `preview` pochodzi z
// IPC (main policzył wiersze przez buildDiffRows): { kind, rows, added, removed }
// albo { kind:'binary'|'tooLarge' }. Renderer tylko maluje — bez importu core.
export default function DiffDialog({ open, onOpenChange, title, preview }) {
  const { t } = useApp();

  let body;
  if (!preview || preview.kind === 'binary') {
    body = <p className="text-sm text-muted-foreground">{t.DiffBinary}</p>;
  } else if (preview.kind === 'tooLarge') {
    body = <p className="text-sm text-muted-foreground">{t.DiffTooLarge}</p>;
  } else {
    const rows = preview.rows || [];
    const gutterW = String(Math.max(1, ...rows.map((r) => Math.max(r.aLn || 0, r.bLn || 0)))).length;
    body = (
      <div className="max-h-[60vh] overflow-auto rounded-md border border-border bg-card/40 p-2 font-mono text-xs leading-relaxed">
        {rows.length === 0
          ? <p className="text-muted-foreground">{t.DiffNoChanges}</p>
          : rows.map((r, i) => {
              if (r.type === 'fold') {
                return <div key={i} className="text-muted-foreground">{'  '.padStart(gutterW)}  {fmt(t.DiffFold, { count: r.count })}</div>;
              }
              const ln = r.type === 'del' ? r.aLn : r.bLn;
              const cls = r.type === 'add' ? 'text-green-500' : r.type === 'del' ? 'text-red-500' : '';
              const sign = r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' ';
              return (
                <div key={i} className="whitespace-pre">
                  <span className="text-muted-foreground">{String(ln).padStart(gutterW)} </span>
                  <span className={cls}>{sign} {r.line}</span>
                </div>
              );
            })}
      </div>
    );
  }

  const summary = preview && preview.kind === 'text'
    ? (preview.added === 0 && preview.removed === 0 ? t.DiffNoChanges : fmt(t.DiffSummary, { added: preview.added, removed: preview.removed }))
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="font-mono text-sm">{title}</DialogTitle></DialogHeader>
        {body}
        {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
      </DialogContent>
    </Dialog>
  );
}
```

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0 (the new file
compiles; an unused-but-valid component is fine).

### Step 5: Wire the Preview button into `ConflictsPanel`

5a. Add imports at the top of `ConflictsPanel.jsx`:
```jsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import DiffDialog from './DiffDialog.jsx';
import { fmt } from '@/lib/utils';
import { Eye } from 'lucide-react';
```
(`React` is already imported; add `useState` to its import or import from 'react' as above —
do not create a duplicate default React import. Easiest: change the existing
`import React from 'react';` to `import React, { useState } from 'react';`.)

5b. Inside the component, add preview state and a handler after the `cmd` definition:
```jsx
  const [pv, setPv] = useState({ open: false, title: '', preview: null });
  const [pvBusy, setPvBusy] = useState(false);
  const preview = async (m) => {
    setPvBusy(true);
    try {
      const p = await call(() => api.previewConflict({ file: m.File, type: m.Type }));
      setPv({ open: true, title: fmt(t.DiffTitle, { name: m.File.Name }), preview: p });
    } finally { setPvBusy(false); }
  };
```

5c. Add a Preview button as the **first** child of the per-conflict action group
(`<div className="flex shrink-0 gap-2">`), before the Download/Upload buttons:
```jsx
              <Button variant="ghost" size="sm" disabled={pvBusy} onClick={() => preview(m)}>
                <Eye className="h-4 w-4" /> {t.ActionPreviewShort}
              </Button>
```

5d. Render the dialog once, just before the component's closing `</div>` of the outer
`return` (i.e., as a sibling after the `mismatches.map(...)` block):
```jsx
      <DiffDialog open={pv.open} onOpenChange={(o) => setPv((s) => ({ ...s, open: o }))} title={pv.title} preview={pv.preview} />
```

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0, and
`grep -n "api.previewConflict" apps/desktop/renderer/src/components/ConflictsPanel.jsx` → one match.

### Step 6: Version bump + changelog (repo convention)

Increment the patch version by 1 in `package.json`, `apps/cli/package.json`,
`packages/core/package.json` (leave `apps/desktop/package.json`). Add to the top of
`CHANGELOG.md`:
```
## [X.Y.Z] — 2026-06-29
### Added
- Desktop: read-only diff preview before resolving a conflict (download/upload), matching the CLI. Computed in the main process; binary/too-large variants handled.
```
**Verify**: `node -e "const a=require('./package.json').version,b=require('./apps/cli/package.json').version,c=require('./packages/core/package.json').version;if(a!==b||b!==c)throw new Error('mismatch');console.log('synced',a)"`
→ `synced X.Y.Z`.

## Test plan

No automated desktop harness. Verify by:

1. **Renderer build**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0.
2. **Regression guard**: `npm test` → green.
3. **Manual smoke** (`npm run dev`): connect → template with at least one **Timestamp**
   conflict (edit a file both locally and on the shop, or just locally and wait for the poll):
   - On the conflict card, click **Podgląd**. A dialog opens showing colored `+`/`-` lines
     with line numbers and a `+A −R` summary. Long unchanged runs collapse to "⋯ N …".
   - For a `LocalMissing` conflict (file only on the server) the preview shows the remote
     content as additions; for `RemoteMissing` (only local) it shows the local content.
   - Open a binary file conflict (e.g. an image) → the dialog shows "Plik binarny — brak
     podglądu" (no crash).
   - Close the dialog; Download/Upload still work exactly as before.

## Done criteria

ALL must hold:
- [ ] `npm run build:renderer --workspace @liquidflow/desktop` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -n "sync.previewConflict" apps/desktop/electron/main.js` → 1 match
- [ ] `grep -n "previewConflict" apps/desktop/electron/preload.cjs` → 1 match
- [ ] `apps/desktop/renderer/src/components/DiffDialog.jsx` exists
- [ ] `grep -n "api.previewConflict" apps/desktop/renderer/src/components/ConflictsPanel.jsx` → 1 match
- [ ] Versions synced across the three `package.json`; `CHANGELOG.md` updated
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 012 updated
- [ ] Manual smoke (text diff + binary variant) performed and confirmed

## STOP conditions

Stop and report if:
- The "Current state" excerpts don't match the live code (drift since `49dbf68`).
- `previewConflict` returns a shape other than the three documented kinds (re-read
  `packages/core/src/syncEngine.js` around line 460 and report).
- `import('@liquidflow/core')` inside the main handler fails or `buildDiffRows` is not an
  export (re-check `packages/core/index.js` line 12) — report; do not reimplement the diff in
  the renderer.
- `npm run build:renderer` fails twice after a reasonable fix.
- You need to edit any `packages/core/**` file.

## Maintenance notes

- The diff display is intentionally **computed in the main process** so the renderer never
  imports core. If a future refactor moves diffing to the renderer, it must first ensure the
  renderer's bundle can tree-shake `diff.js` away from the `node:fs`-using core modules
  (currently it cannot — the barrel re-exports `store`/`git`).
- When the desktop UI is redesigned, `DiffDialog` is self-contained and reusable; the only
  contract is the `{ kind, rows, added, removed }` payload shape from `sync.previewConflict`.
- Reviewer should check: the gutter width calc and that `fold`/`ctx`/`add`/`del` all render;
  and that the preview button never mutates the file (it's read-only).
- Deferred: scroll-to-change / side-by-side view. The CLI uses a single unified column;
  desktop matches that. Not worth more now.
