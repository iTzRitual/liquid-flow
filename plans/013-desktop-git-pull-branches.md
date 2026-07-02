# Plan 013: Desktop git collaboration — pull and branch switch/create

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 49dbf68..HEAD -- apps/desktop/electron/main.js apps/desktop/electron/preload.cjs apps/desktop/renderer/src/components/GitPanel.jsx apps/desktop/renderer/src/lib/utils.js packages/core/src/controller.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (lower than 011/012 — these are collaboration features, less central)
- **Effort**: L
- **Risk**: MED (touches the git working tree via the session; renderer + bridge only)
- **Depends on**: none required, but **best landed after 011** (shares the `fmt` helper and
  the `git.uncommittedCount` bridge — both added idempotently here too)
- **Category**: migration (desktop ↔ core parity)
- **Planned at**: commit `49dbf68`, 2026-06-29

## Why this matters

The git redesign added remote collaboration to the core: `gitPull` (fast-forward the target
stream from origin), `gitListBranches`, `gitCreateBranch`, and `gitSwitchBranch` (switch which
branch is the "target stream"). The CLI exposes all of these in its `/git` menu; the desktop
exposes none of them — `preload.cjs` only bridges the pre-redesign git methods. This plan
brings **pull** and **branch switch/create** to the desktop. All required i18n keys already
exist in both `pl` and `en`. Changes are additive (IPC bridge + one new card in the Git tab).

**Clone is intentionally excluded** from this plan: `controller.gitClone` requires the
template's mode-0 working dir to be **empty**
(`packages/core/src/controller.js:716`: `if (localFiles.some((f) => f.mode === 0)) throw …
GitCloneDirNotEmpty`), but selecting a template auto-downloads mode-0, so clone is unreachable
in the normal desktop flow — the same connect-time-reachability gap tracked by CLI plan
**009** (TODO). Add clone only as a follow-up once 009 defines a pre-download bootstrap entry
point.

## Current state

Files and roles:
- `apps/desktop/electron/main.js` — IPC `handlers` map.
- `apps/desktop/electron/preload.cjs` — `window.api`.
- `apps/desktop/renderer/src/components/GitPanel.jsx` — Git tab UI.
- `apps/desktop/renderer/src/components/GitBranches.jsx` — **create** (the branch card).
- `apps/desktop/renderer/src/lib/utils.js` — `cn`, `fmtDate` (+ `fmt` if a prior plan added it).
- `packages/core/src/controller.js` — has the methods below (read-only reference).

Core methods to bridge (read-only — confirm signatures, do not edit core):
`packages/core/src/controller.js`:
```js
  async gitPull() { /* ~626: ff-only pull of targetBranch; throws GitPublishBeforePull if ahead>0 */ }
  async gitCreateBranch(name) { /* ~661 */ }
  async gitSwitchBranch(name, { discard = false } = {}) { /* ~677: switch target stream; throws GitSwitchUncommitted if ahead>0 && !discard */ }
  async gitListBranches() { /* ~703: returns string[] of branches, hidden wip filtered out */ }
  async gitUncommittedCount() { /* ~403: number of pending versions on wip vs target */ }
```

`gitStatus()` (already bridged as `git.status`) already returns `branch` (the current target
stream) and `ahead` (pending version count) — the renderer reads `git.branch` / `git.ahead`
from context. Confirmed at `packages/core/src/controller.js:432-450`.

The bridge pattern, from existing `apps/desktop/electron/main.js` git handlers (~lines
112-119) and `preload.cjs` (~lines 32-40) — see those blocks; you append to them.

Current `GitPanel.jsx` no-repo / enable card (you leave this as-is — clone is out of scope):
```jsx
          {!active ? (
            <Button onClick={enable} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} {t.EnableVersioning}
            </Button>
          ) : (
```
Current `GitPanel.jsx` remote/push row (you add a Pull button here):
```jsx
                <div className="flex gap-2">
                  <Input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder={t.GitRemotePlaceholder} />
                  <Button variant="secondary" onClick={saveRemote}>{t.Save}</Button>
                  <Button variant="outline" onClick={push} disabled={busy || !git.remote}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Push
                  </Button>
                </div>
```
`GitPanel` already pulls `git` and `setGit` from `useApp()` and has a `reload()` that refreshes
status — reuse them. Its imports include `Button`, `Input`, `Label`, `Badge`, `Card*`,
`Switch`, `ConfirmButton`, and lucide icons.

### i18n keys (already present in both `pl` and `en` — do NOT add any)

```
grep -nE "GitPull:|ConfirmPull:|GitPulling:|GitBranches:|GitBranchCreate:|GitBranchNameField:|GitBranchSwitch:|ConfirmSwitchBranch:|GitSwitchDiscardConfirm:|GitPublishBeforePull:|GitCurrentSuffix:|Versions:|Save:|Cancel:" packages/core/src/translations.js
```
Expected: each appears twice (pl + en). Token-bearing keys (need `fmt`): `ConfirmSwitchBranch`
("Przełączyć strumień na gałąź {name}?"), `GitSwitchDiscardConfirm` ("Porzucić {count}
niezatwierdzonych wersji i przełączyć na {name}?").

### Repo conventions
- Renderer token interpolation via `fmt(str, params)` (the renderer can't import `tfmt`).
- Reuse shadcn `Button`/`Input`/`Card`/`ConfirmButton`. Avoid the radix `Select` (its API is
  fiddly) — render branches as a simple list of rows.
- Polish comments; user-facing text via `t.<Key>`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Drift check | `git diff --stat 49dbf68..HEAD -- <in-scope paths>` | empty or re-verify |
| Renderer compiles | `npm run build:renderer --workspace @liquidflow/desktop` | exit 0 |
| Regression guard | `npm test` | exit 0, green |
| Bridge wired | `grep -nE "git.pull\|git.switchBranch\|git.createBranch\|git.listBranches" apps/desktop/electron/main.js` | 4 matches |
| Manual smoke | `npm run dev` | see "Manual smoke" |

The desktop is not covered by Vitest; the renderer build + manual smoke are the real checks.

## Scope

**In scope**:
- `apps/desktop/electron/main.js` (add ~5 handler lines; `git.uncommittedCount` idempotent)
- `apps/desktop/electron/preload.cjs` (add ~5 `window.api.git` methods; idempotent overlap ok)
- `apps/desktop/renderer/src/components/GitPanel.jsx` (add Pull button + mount `<GitBranches/>`)
- `apps/desktop/renderer/src/components/GitBranches.jsx` (**create**)
- `apps/desktop/renderer/src/lib/utils.js` (`fmt` helper — idempotent)
- `package.json`, `apps/cli/package.json`, `packages/core/package.json` (version bump — Step 6)
- `CHANGELOG.md` (Step 6)

**Out of scope**:
- `packages/core/**` — all methods exist; no change.
- `packages/core/src/translations.js` — all keys exist.
- **Clone** UI/bridge — deferred (see "Why this matters"); do not add it.
- Checkpoint (plan 011), diff preview (plan 012), log/progress (plan 014).
- Any GitPanel redesign beyond the two additions.

## Git workflow

Commit to `main`; bump patch version in root + `apps/cli` + `packages/core` `package.json`
(not `apps/desktop`) + `CHANGELOG.md`. Conventional Commits, English, no `Co-Authored-By`.
Suggested: `feat(desktop): git pull and branch switch/create`. **Do NOT `git push`.**

## Steps

### Step 1: Ensure the `fmt` helper exists (idempotent)

In `apps/desktop/renderer/src/lib/utils.js`, if there is no `export function fmt`, add after
`fmtDate`:
```js
// Podstawienie tokenów {name} w stringach i18n (renderer nie importuje tfmt z core).
export function fmt(str, params = {}) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}
```
**Verify**: `grep -n "export function fmt" apps/desktop/renderer/src/lib/utils.js` → one match.

### Step 2: Bridge the methods in the main process

In `apps/desktop/electron/main.js`, add to the `handlers` map after the `'git.push'` line
(skip any line whose key already exists from a prior plan — e.g. `git.uncommittedCount` may be
present from plan 011):
```js
    'git.pull': () => ctrl.gitPull(),
    'git.listBranches': () => ctrl.gitListBranches(),
    'git.createBranch': (name) => ctrl.gitCreateBranch(name),
    'git.switchBranch': (data) => ctrl.gitSwitchBranch(data && data.name, { discard: !!(data && data.discard) }),
    'git.uncommittedCount': () => ctrl.gitUncommittedCount(),
```
**Verify**: `grep -nE "git.pull|git.listBranches|git.createBranch|git.switchBranch" apps/desktop/electron/main.js` → 4 matches (and exactly one `git.uncommittedCount`).

### Step 3: Expose them on `window.api.git` in preload

In `apps/desktop/electron/preload.cjs`, inside `git: { ... }`, add after `push` (skip
duplicates of any key already present):
```js
    pull: () => invoke('git.pull'),
    listBranches: () => invoke('git.listBranches'),
    createBranch: (name) => invoke('git.createBranch', name),
    switchBranch: (name, opts) => invoke('git.switchBranch', { name, discard: !!(opts && opts.discard) }),
    uncommittedCount: () => invoke('git.uncommittedCount'),
```
**Verify**: `grep -nE "pull:|listBranches:|createBranch:|switchBranch:" apps/desktop/electron/preload.cjs` → 4 matches.

### Step 4: Create the `GitBranches` card component

Create `apps/desktop/renderer/src/components/GitBranches.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ConfirmButton from './ConfirmButton.jsx';
import { fmt } from '@/lib/utils';
import { GitBranch, Check, Plus } from 'lucide-react';

// Zarządzanie gałęziami (strumieniami) — lista + przełącz + utwórz. „Strumień
// docelowy" to git.branch; ukryta gałąź wip nigdy się nie pojawia (rdzeń ją filtruje).
export default function GitBranches() {
  const { t, api, call, git, setGit } = useApp();
  const [branches, setBranches] = useState([]);
  const [newName, setNewName] = useState('');

  const load = async () => {
    try { setBranches(await api.git.listBranches()); } catch { setBranches([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [git && git.branch]);

  const refresh = async () => { const s = await call(() => api.git.status(), { errorToast: false }).catch(() => null); if (s) setGit(s); await load(); };

  const doSwitch = async (name, discard) => { await call(() => api.git.switchBranch(name, { discard })); await refresh(); };
  const createBranch = async () => {
    if (!newName.trim()) return;
    await call(() => api.git.createBranch(newName.trim()));
    setNewName('');
    await refresh();
  };

  const ahead = git ? git.ahead : 0;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" /> {t.GitBranches}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y divide-border">
          {branches.map((b) => {
            const current = git && b === git.branch;
            return (
              <li key={b} className="flex items-center gap-2 py-1.5">
                <code className="min-w-0 flex-1 truncate text-sm">{b}{current ? t.GitCurrentSuffix : ''}</code>
                {current
                  ? <Check className="h-4 w-4 text-primary" />
                  : <ConfirmButton variant="outline" size="sm"
                      title={t.GitBranchSwitch}
                      message={ahead > 0 ? fmt(t.GitSwitchDiscardConfirm, { count: ahead, name: b }) : fmt(t.ConfirmSwitchBranch, { name: b })}
                      confirmLabel={t.GitBranchSwitch}
                      onConfirm={() => doSwitch(b, ahead > 0)}>
                      {t.GitBranchSwitch}
                    </ConfirmButton>}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.GitBranchNameField} />
          <Button variant="secondary" onClick={createBranch}><Plus className="h-4 w-4" /> {t.GitBranchCreate}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```
Note: switching when `ahead > 0` passes `discard:true` and the confirm message
(`GitSwitchDiscardConfirm`) explicitly says it discards those pending versions — this matches
the core guard (`gitSwitchBranch` throws unless `discard` is set).

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0.

### Step 5: Add the Pull button and mount `GitBranches` in `GitPanel`

5a. Import the new component and a Pull icon at the top of `GitPanel.jsx`:
```jsx
import GitBranches from './GitBranches.jsx';
```
Add `DownloadCloud` to the existing `lucide-react` import line.

5b. Add a Pull button in the remote/push row, after the Push `<Button>`:
```jsx
                  <ConfirmButton variant="outline" disabled={!git.remote}
                    title={t.GitPull} message={t.ConfirmPull} confirmLabel={t.GitPull}
                    onConfirm={async () => { await call(() => api.git.pull()); await reload(); }}>
                    <DownloadCloud className="h-4 w-4" /> {t.GitPull}
                  </ConfirmButton>
```
(If `ahead > 0`, the core throws `GitPublishBeforePull`; the `call()` wrapper shows that as an
error toast — no client-side guard needed. `ConfirmButton` accepts a `disabled` prop? It does
not currently forward one — if the build complains, drop `disabled={!git.remote}`; pull on a
repo without a remote simply toasts "no remote".)

5c. Mount the branches card. In the active-repo branch, after the version-history `Card`
(the `{active && (<Card>…history…</Card>)}` block near the end of the component), add:
```jsx
      {active && <GitBranches />}
```

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0, and
`grep -nE "api.git.pull|GitBranches" apps/desktop/renderer/src/components/GitPanel.jsx` → ≥ 2 matches.

### Step 6: Version bump + changelog (repo convention)

Increment the patch version by 1 in `package.json`, `apps/cli/package.json`,
`packages/core/package.json` (leave `apps/desktop/package.json`). Add to `CHANGELOG.md` top:
```
## [X.Y.Z] — 2026-06-29
### Added
- Desktop: git pull (fast-forward target stream) and branch management — list/switch/create — matching the CLI /git menu. (Clone deferred to the plan 009 connect-time bootstrap.)
```
**Verify**: `node -e "const a=require('./package.json').version,b=require('./apps/cli/package.json').version,c=require('./packages/core/package.json').version;if(a!==b||b!==c)throw new Error('mismatch');console.log('synced',a)"`
→ `synced X.Y.Z`.

## Test plan

No automated desktop harness. Verify by:
1. **Renderer build**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0.
2. **Regression guard**: `npm test` → green.
3. **Manual smoke** (`npm run dev`, a template with git enabled):
   - **Branches card** lists at least the current target branch with "(bieżąca)/(current)"
     and a check icon. Type a name, click **Utwórz nową gałąź** → it appears in the list.
   - Click **Przełącz strumień** on a non-current branch with no pending versions → confirm →
     the current marker moves; `git.branch` in the header/badges updates.
   - Make an edit (auto-commit) so pending versions exist (`+N` from plan 011, or just create
     divergence), then **Przełącz strumień** → the confirm text says it will **discard N
     versions** → confirm → switch happens.
   - With a remote set and no pending versions, **Pull** → success toast (or a clean "already
     up to date"). With pending versions, **Pull** → error toast "Zatwierdź je (checkpoint)
     przed pobraniem" (`GitPublishBeforePull`).

## Done criteria

ALL must hold:
- [ ] `npm run build:renderer --workspace @liquidflow/desktop` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -nE "git.pull|git.listBranches|git.createBranch|git.switchBranch" apps/desktop/electron/main.js` → 4 matches
- [ ] `grep -nE "pull:|listBranches:|createBranch:|switchBranch:" apps/desktop/electron/preload.cjs` → 4 matches
- [ ] `apps/desktop/renderer/src/components/GitBranches.jsx` exists and is mounted in `GitPanel.jsx`
- [ ] `grep -n "api.git.pull" apps/desktop/renderer/src/components/GitPanel.jsx` → 1 match
- [ ] Exactly one `git.uncommittedCount` handler in `main.js` (no duplicate if 011 landed)
- [ ] Versions synced across the three `package.json`; `CHANGELOG.md` updated
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 013 updated
- [ ] Manual smoke (create + switch with and without pending versions, pull) performed

## STOP conditions

Stop and report if:
- "Current state" excerpts don't match live code (drift since `49dbf68`).
- `ConfirmButton` does not accept the `disabled`/`title`/`message`/`confirmLabel` props you
  pass and the build fails — re-read `apps/desktop/renderer/src/components/ConfirmButton.jsx`
  and adapt (it currently accepts `title`, `message`, `confirmLabel`, `variant`, `size`,
  `onConfirm`; it does **not** accept `disabled` — remove that prop if it errors).
- `gitSwitchBranch` / `gitPull` signatures differ from the excerpts (re-read controller).
- `npm run build:renderer` fails twice after a reasonable fix.
- You need to add a **clone** button — that is deliberately out of scope (see plan 009).
- You need to edit any `packages/core/**` file.

## Maintenance notes

- `git.branch` is always the **target stream**; the hidden `liquidflow/wip` is filtered out by
  `gitListBranches` in core — never surface it in the UI.
- Switching streams with pending versions **discards** them by design (core requires the
  explicit `discard` flag). Keep the discard wording in the confirm; do not silently pass
  `discard:true` without the `GitSwitchDiscardConfirm` message.
- **Clone** is the missing sibling. Add it only after plan 009 introduces a connect-time
  bootstrap that runs *before* mode-0 is downloaded (clone needs an empty working dir). When
  that lands, bridge `git.clone` and add a clone option to the no-repo card.
- Reviewer should check: the `ahead`-based discard branch in `GitBranches`, and that Pull
  errors surface as toasts rather than silently failing.
