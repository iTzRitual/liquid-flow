# Plan 014: Desktop renders the sync-start progress loader and styles log history/separators

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 49dbf68..HEAD -- apps/desktop/renderer/src/App.jsx apps/desktop/renderer/src/components/SyncView.jsx apps/desktop/renderer/src/components/LogPanel.jsx packages/core/src/syncEngine.js packages/core/src/log.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3 (polish — visual parity, no behavior change)
- **Effort**: S
- **Risk**: LOW (renderer-only; no bridge, no core, no new i18n keys)
- **Depends on**: none
- **Category**: migration (desktop ↔ core parity) / dx
- **Planned at**: commit `49dbf68`, 2026-06-29

## Why this matters

Two small parity gaps where the data already reaches the desktop but the UI ignores it:

1. **No sync-start loader.** The core emits `progress` events (download → check → ready) and
   `App.jsx` already stores the payload in state — but **no component renders it**, so when a
   template is selected the user stares at a static screen while files download. The CLI shows
   a spinner + a 0-100% bar (`ProgressView`). (`CLAUDE.md` explicitly notes: "desktop dostaje
   zdarzenie `progress`, ale nie ma jeszcze UI loadera startu.")
2. **Flat log history.** The per-template log history loads on session start (greyed
   "historic" entries + a "new session" separator line in the CLI), and the desktop *receives*
   those entries — but `LogPanel` paints every entry identically, so the separator looks like a
   stray line and old entries are indistinguishable from live ones.

Both are fixed purely in the renderer: render the `progress` payload, and branch `LogPanel` on
the `kind:'separator'` / `historic:true` fields the entries already carry. No IPC, no core, no
translations.

## Current state

Files and roles:
- `apps/desktop/renderer/src/App.jsx` — root; subscribes to backend events, stores `progress`
  in state, and passes it through context (`ctx.progress`).
- `apps/desktop/renderer/src/components/SyncView.jsx` — the sync screen (where the loader belongs).
- `apps/desktop/renderer/src/components/LogPanel.jsx` — the log list.
- `apps/desktop/renderer/src/components/ProgressBar.jsx` — **create**.
- `packages/core/src/syncEngine.js` / `log.js` — emit the data (read-only reference).

**The raw `progress` payload** the backend sends (confirmed at
`packages/core/src/syncEngine.js:93-160` — the desktop stores it *unmodified*, unlike the CLI
which pre-transforms it):
```
{ phase: 'download', state: 'start' }
{ phase: 'download', state: 'progress', done, total }
{ phase: 'download', state: 'done', count }
{ phase: 'check',    state: 'start' }
{ phase: 'check',    state: 'done', conflicts }
{ phase: 'ready',    template }
```

`App.jsx` current progress handling (verbatim) — the event handler and the context:
```jsx
      else if (type === 'progress') setProgress(payload);
```
```jsx
  const ctx = {
    t, languages, language, version, shops, currentShop, currentTemplate,
    mismatches, log, git, progress, route, navigate,
    ...
```
So `progress` is already in context; you only need to (a) clear it when finished and
(b) render it.

`LogPanel.jsx` current render (verbatim):
```jsx
import React, { useEffect, useRef } from 'react';
import { useApp } from '../App.jsx';
import { fmtDate } from '@/lib/utils';

export default function LogPanel() {
  const { t, log } = useApp();
  const ref = useRef(null);

  return (
    <div ref={ref} className="h-full overflow-y-auto rounded-lg border border-border bg-card/40 p-2 font-mono text-xs">
      {log.length === 0 && <p className="p-3 text-muted-foreground">{t.NoEntries}</p>}
      <ul className="space-y-0.5">
        {log.map((e) => (
          <li key={e.Id} className="flex gap-3 rounded px-2 py-1 hover:bg-accent/50">
            <span className="shrink-0 text-muted-foreground">{fmtDate(e.TS)}</span>
            <span style={{ color: e.Color }}>{e.Text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**The log entry fields** you will branch on (read-only reference,
`packages/core/src/log.js:11-18`): each entry is
`{ Id, TS, Text, Color, kind?, historic?, msg?, params?, sepKey?, sepTs? }`, where
`kind:'separator'` marks a session-divider line and `historic:true` marks an entry loaded from
a previous session. `Text` is already the rendered, translated string for both (for a
separator, `log.js` renders `Text` from `sepKey` + `sepTs`), so you only change *styling*, not
text.

`SyncView.jsx` header region (where the loader mounts) — the destructure and the header
`<div>`:
```jsx
  const { t, api, call, currentShop, currentTemplate, mismatches, setMismatches, setLog, setGit } = useApp();
```
```jsx
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        ...
        <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4" /> {t.Refresh}</Button>
      </div>
```

### i18n keys (already present in both `pl` and `en` — do NOT add any)
```
grep -nE "DownloadingFiles:|CheckingMismatch:|NoEntries:" packages/core/src/translations.js
```
Expected: each appears twice. `DownloadingFiles` = "Pobieranie plików ze sklepu", `CheckingMismatch`
= "Sprawdzanie niezgodności plików".

### Repo conventions
- Tailwind utility classes as elsewhere in the renderer; `cn()` from `@/lib/utils` for
  conditional classes (see `Sidebar.jsx` for the pattern).
- Polish comments; user-facing strings via `t.<Key>`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Drift check | `git diff --stat 49dbf68..HEAD -- <in-scope paths>` | empty or re-verify |
| Renderer compiles | `npm run build:renderer --workspace @liquidflow/desktop` | exit 0 |
| Regression guard | `npm test` | exit 0, green |
| Manual smoke | `npm run dev` | see "Manual smoke" |

## Scope

**In scope**:
- `apps/desktop/renderer/src/components/ProgressBar.jsx` (**create**)
- `apps/desktop/renderer/src/App.jsx` (clear `progress` on done/ready — one line)
- `apps/desktop/renderer/src/components/SyncView.jsx` (mount `<ProgressBar/>`)
- `apps/desktop/renderer/src/components/LogPanel.jsx` (separator + historic styling)
- `package.json`, `apps/cli/package.json`, `packages/core/package.json` (version bump — Step 5)
- `CHANGELOG.md` (Step 5)

**Out of scope**:
- `packages/core/**` and `packages/core/src/translations.js` — no changes; the data and keys
  already exist.
- Any IPC bridge change — none needed.
- Other desktop features (checkpoint/diff/branches — plans 011/012/013).

## Git workflow

Commit to `main`; bump patch version in root + `apps/cli` + `packages/core` `package.json`
(not `apps/desktop`) + `CHANGELOG.md`. Conventional Commits, English, no `Co-Authored-By`.
Suggested: `feat(desktop): sync-start progress loader and log history styling`.
**Do NOT `git push`.**

## Steps

### Step 1: Create the `ProgressBar` component

Create `apps/desktop/renderer/src/components/ProgressBar.jsx`:
```jsx
import React from 'react';
import { useApp } from '../App.jsx';
import { Loader2 } from 'lucide-react';

// Loader startu synchronizacji. `progress` to surowy payload z rdzenia:
// { phase:'download'|'check'|'ready', state:'start'|'progress'|'done', done?, total? }.
export default function ProgressBar({ progress }) {
  const { t } = useApp();
  if (!progress || progress.phase === 'ready') return null;

  const label = progress.phase === 'download' ? t.DownloadingFiles
    : progress.phase === 'check' ? t.CheckingMismatch : '';
  if (!label) return null;

  const determinate = progress.phase === 'download' && progress.state === 'progress' && progress.total > 0;
  const pct = determinate ? Math.round(Math.min(1, progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex w-full items-center gap-3 border-b border-border bg-card/40 px-6 py-2 text-xs">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
        <div
          className={determinate ? 'h-full bg-primary transition-all' : 'h-full w-1/3 animate-pulse bg-primary'}
          style={determinate ? { width: `${pct}%` } : undefined}
        />
      </div>
      {determinate && <span className="shrink-0 tabular-nums text-muted-foreground">{pct}% · {progress.done}/{progress.total}</span>}
    </div>
  );
}
```

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0.

### Step 2: Clear `progress` when the start sequence finishes (App.jsx)

In `apps/desktop/renderer/src/App.jsx`, replace the progress event line:
```jsx
      else if (type === 'progress') setProgress(payload);
```
with one that drops the loader once download/check is done or the session is ready (mirrors the
CLI behavior — otherwise the bar would linger):
```jsx
      else if (type === 'progress') setProgress(payload && payload.phase !== 'ready' && payload.state !== 'done' ? payload : null);
```

**Verify**: `grep -n "payload.phase !== 'ready'" apps/desktop/renderer/src/App.jsx` → one match.

### Step 3: Mount the loader in `SyncView`

In `apps/desktop/renderer/src/components/SyncView.jsx`:
- Add `progress` to the `useApp()` destructure:
  ```jsx
  const { t, api, call, currentShop, currentTemplate, mismatches, setMismatches, setLog, setGit, progress } = useApp();
  ```
- Import the component near the other imports:
  ```jsx
  import ProgressBar from './ProgressBar.jsx';
  ```
- Render it directly under the header `</div>` (between the header block and the `<Tabs …>`),
  so the bar spans the width when a session is starting:
  ```jsx
      <ProgressBar progress={progress} />
  ```

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0, and
`grep -n "ProgressBar" apps/desktop/renderer/src/components/SyncView.jsx` → 2 matches (import + usage).

### Step 4: Style separators and historic entries in `LogPanel`

In `apps/desktop/renderer/src/components/LogPanel.jsx`:
- Add `cn` to the utils import:
  ```jsx
  import { fmtDate, cn } from '@/lib/utils';
  ```
- Replace the `{log.map((e) => ( … ))}` block with one that branches on `kind`/`historic`:
  ```jsx
        {log.map((e) => {
          // Separator (granica sesji) — linia działowa zamiast zwykłego wpisu.
          if (e.kind === 'separator') {
            return (
              <li key={e.Id} className="flex items-center gap-2 px-2 py-1 text-[11px]" style={{ color: e.Color }}>
                <span className="h-px flex-1" style={{ backgroundColor: e.Color, opacity: 0.4 }} />
                <span className="shrink-0">{e.Text}</span>
                <span className="h-px flex-1" style={{ backgroundColor: e.Color, opacity: 0.4 }} />
              </li>
            );
          }
          // Wpis historyczny (poprzednia sesja) — wyszarzony.
          return (
            <li key={e.Id} className={cn('flex gap-3 rounded px-2 py-1 hover:bg-accent/50', e.historic && 'opacity-50')}>
              <span className="shrink-0 text-muted-foreground">{fmtDate(e.TS)}</span>
              <span style={{ color: e.Color }}>{e.Text}</span>
            </li>
          );
        })}
  ```

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0, and
`grep -n "kind === 'separator'\|e.historic" apps/desktop/renderer/src/components/LogPanel.jsx` → 2 matches.

### Step 5: Version bump + changelog (repo convention)

Increment the patch version by 1 in `package.json`, `apps/cli/package.json`,
`packages/core/package.json` (leave `apps/desktop/package.json`). Add to `CHANGELOG.md` top:
```
## [X.Y.Z] — 2026-06-29
### Added
- Desktop: sync-start progress loader (download/check) and visual styling for log session-separators and greyed historic entries, matching the CLI.
```
**Verify**: `node -e "const a=require('./package.json').version,b=require('./apps/cli/package.json').version,c=require('./packages/core/package.json').version;if(a!==b||b!==c)throw new Error('mismatch');console.log('synced',a)"`
→ `synced X.Y.Z`.

## Test plan

No automated desktop harness. Verify by:
1. **Renderer build**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0.
2. **Regression guard**: `npm test` → green.
3. **Manual smoke** (`npm run dev`):
   - Select a template with several files. While it downloads, a bar appears under the sync
     header showing "Pobieranie plików ze sklepu" and a 0-100% fill; it switches to
     "Sprawdzanie niezgodności plików" (indeterminate pulse), then disappears when ready.
   - Disconnect/reselect the same template so its prior log history loads. In the **Log** tab,
     a centered "── … ──" separator line appears between old and new sessions, and entries
     from the previous session are visibly greyed (opacity) relative to live ones.

## Done criteria

ALL must hold:
- [ ] `npm run build:renderer --workspace @liquidflow/desktop` exits 0
- [ ] `npm test` exits 0
- [ ] `apps/desktop/renderer/src/components/ProgressBar.jsx` exists and is mounted in `SyncView.jsx`
- [ ] `grep -n "payload.phase !== 'ready'" apps/desktop/renderer/src/App.jsx` → 1 match
- [ ] `grep -n "kind === 'separator'" apps/desktop/renderer/src/components/LogPanel.jsx` → 1 match
- [ ] Versions synced across the three `package.json`; `CHANGELOG.md` updated
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 014 updated
- [ ] Manual smoke (loader appears then clears; separator + greyed history) performed

## STOP conditions

Stop and report if:
- "Current state" excerpts don't match live code (drift since `49dbf68`).
- The `progress` payload shape differs from the documented phases/states (re-read
  `packages/core/src/syncEngine.js` `_progress(...)` calls and report) — the loader would
  render nothing or never clear.
- Log entries no longer carry `kind`/`historic` fields (re-read `packages/core/src/log.js`).
- `npm run build:renderer` fails twice after a reasonable fix.

## Maintenance notes

- The desktop stores the **raw** `progress` payload (the CLI pre-transforms it in
  `useController.js`). If the core ever changes the `progress` event shape, both this
  `ProgressBar` and the CLI's `useController` mapping must be updated together.
- Separator text and color come from the core (`log.js` renders `Text` from `sepKey`/`sepTs`
  and sets `Color` to `#82bbff`); the UI only draws the divider rules. If the core adds new
  `kind` values beyond `separator`, extend the `LogPanel` branch.
- This plan is the lowest-risk of the desktop-parity set and a good warm-up; it touches no
  bridge and no core.
