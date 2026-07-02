# Plan 011: Desktop gets the git "checkpoint" workflow (and its Push button stops silently doing the wrong thing)

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

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the daily git path; renderer only, no core changes)
- **Depends on**: none
- **Category**: bug / migration (desktop ↔ core parity)
- **Planned at**: commit `49dbf68`, 2026-06-29

## Why this matters

The core's git layer was redesigned (see plans 006/008, already merged): auto-commits now
land on a **hidden** branch `liquidflow/wip`, and the only way to publish work onto the
visible stream (`main`) is to **checkpoint** (squash-merge wip → target). The desktop UI
was never updated for this. Concretely, today on desktop:

- The user enables git, edits files; auto-commits pile up on the hidden `liquidflow/wip`.
- `GitPanel` shows "N versions" (that's the wip commit count).
- The user clicks **Push**, which calls `controller.gitPush()` → pushes the **target**
  branch (`main`) — which does **not** contain those wip commits. Their work never reaches
  the remote, with no error.
- The **Auto-push** toggle is now a no-op: `autoPush` is only consulted *inside* a
  checkpoint, which the desktop can't trigger.

This plan adds the missing **Checkpoint** action (bridge `gitCheckpoint` +
`gitUncommittedCount`, add a button and a "pending versions" indicator), so the desktop git
workflow matches the CLI and Push/Auto-push become meaningful again. It is purely additive
to the renderer + IPC bridge; no core code changes. **All required i18n keys already exist
in both `pl` and `en`** — no translation work.

## Current state

Files involved and their roles:

- `apps/desktop/electron/main.js` — Electron main process; an IPC `handlers` map routes
  string method names to `Controller` calls.
- `apps/desktop/electron/preload.cjs` — exposes `window.api` to the renderer; each method
  calls `invoke('<method>', arg)`.
- `apps/desktop/renderer/src/components/GitPanel.jsx` — the "Git / backup" tab UI.
- `apps/desktop/renderer/src/lib/utils.js` — small renderer helpers (`cn`, `fmtDate`).
- `packages/core/src/controller.js` — the shared logic (DO NOT edit; read-only reference).

The bridge pattern (how a core method reaches the renderer), from existing code:

`apps/desktop/electron/main.js` (the git block of the `handlers` map, ~lines 112-119):
```js
    'git.status': () => ctrl.gitStatus(),
    'git.enable': () => ctrl.gitEnable(),
    'git.settings': (data) => ctrl.gitSetSettings(data),
    'git.history': (limit) => ctrl.gitHistory(limit),
    'git.restore': (hash) => ctrl.gitRestore(hash),
    'git.setRemote': (url) => ctrl.gitSetRemote(url),
    'git.push': () => ctrl.gitPush(),
```

`apps/desktop/electron/preload.cjs` (the `git:` block of `window.api`, ~lines 32-40):
```js
  git: {
    status: () => invoke('git.status'),
    enable: () => invoke('git.enable'),
    settings: (data) => invoke('git.settings', data),
    history: (limit) => invoke('git.history', limit),
    restore: (hash) => invoke('git.restore', hash),
    setRemote: (url) => invoke('git.setRemote', url),
    push: () => invoke('git.push'),
  },
```

The core methods to bridge (read-only — confirm the signatures, do not edit
`controller.js`):

`packages/core/src/controller.js`:
```js
  // ~line 403
  async gitUncommittedCount() { return this._uncommittedCount(); }

  // ~line 536 — message is the commit text; target is OPTIONAL (defaults to the
  // current target branch). For this plan we always omit target (publish to current).
  async gitCheckpoint(message, target) { /* squash wip → target, optional push */ }
```

`gitStatus()` (already bridged via `git.status`) already returns the fields this plan
displays — confirmed at `packages/core/src/controller.js:432-450`:
```js
    return {
      available, active: true, dir,
      autoCommit, autoPush,
      ...st,                    // isRepo, remote, dirty, lastCommit, commitCount
      branch: this.activeGit.targetBranch,   // the VISIBLE target stream (never wip)
      ahead,                    // number of uncommitted versions (commits on wip not in target)
      _tcfg,
    };
```
So `git.ahead` (pending versions to publish) and `git.branch` (target stream name) are
already available to the renderer **today** via the `git` event / `api.git.status()` — this
plan only needs to *display* them and add the checkpoint action.

Current `GitPanel.jsx` (the part you will extend — the "active repo" badges and the
remote/push row), verbatim excerpt:
```jsx
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="success" className="gap-1"><GitCommit className="h-3 w-3" /> {git.commitCount} {t.Versions}</Badge>
                {git.dirty && <Badge variant="warning">{t.UncommittedChanges}</Badge>}
                {git.remote && <Badge variant="secondary" className="gap-1"><Cloud className="h-3 w-3" /> origin</Badge>}
                {git.lastCommit && <span className="text-xs text-muted-foreground">{t.LastLabel}: {git.lastCommit.message} ({git.lastCommit.relative})</span>}
              </div>
```
and the imports line:
```jsx
import { GitBranch, GitCommit, History, UploadCloud, RotateCcw, Power, Loader2, Cloud } from 'lucide-react';
```
and the helpers defined near the top of the component:
```jsx
  const enable = async () => { setBusy(true); try { const s = await call(() => api.git.enable()); setGit(s); await reload(); } finally { setBusy(false); } };
  const setSetting = async (patch) => { const s = await call(() => api.git.settings(patch)); setGit(s); };
  const saveRemote = async () => { const s = await call(() => api.git.setRemote(remote)); setGit(s); };
  const push = async () => { setBusy(true); try { await call(() => api.git.push()); await reload(); } finally { setBusy(false); } };
  const restore = async (hash) => { await call(() => api.git.restore(hash)); await reload(); };
```

### i18n keys (already present in both `pl` and `en` — do NOT add any)

Verify with the command below; all must print a `pl:` and an `en:` line:
- `GitCheckpoint` = "Zatwierdź wersję (checkpoint)" / "Checkpoint (commit version)"
- `GitCheckpointTitle` = "Nowy punkt kontrolny" / "New checkpoint"
- `GitCheckpointMessageField` = "Opis zmian (commit message)" / "Commit message"
- `GitCheckpointing` = "Tworzenie punktu kontrolnego..." / "Creating checkpoint..."
- `Versions` = "wersji" / "versions"
- `Save` / `Cancel` — already used throughout the renderer.

```
grep -nE "GitCheckpoint:|GitCheckpointTitle:|GitCheckpointMessageField:|GitCheckpointing:|Versions:" packages/core/src/translations.js
```
Expected: each key appears **twice** (once in the `pl` table, once in `en`).

### Repo conventions to match

- **No token interpolation in the renderer.** The renderer cannot import `tfmt` from core
  (core uses `node:fs`). The existing UI composes token-free, e.g.
  `{git.commitCount} {t.Versions}`. The checkpoint **message** field is free text typed by
  the user, so this plan needs **no** interpolation. (A `fmt()` helper is introduced in
  Step 1 only so later plans can reuse it; this plan does not interpolate any key.)
- Buttons/dialogs use the shadcn components already in
  `apps/desktop/renderer/src/components/ui/` (`Button`, `Dialog*`, `Input`, `Label`,
  `Badge`). Match `ConfirmButton.jsx` for the Dialog structure.
- Comments in Polish; all user-facing text via `t.<Key>` (see i18n list above).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Drift check | `git diff --stat 49dbf68..HEAD -- <in-scope paths>` | empty, or you re-verify excerpts |
| Renderer compiles | `npm run build:renderer --workspace @liquidflow/desktop` | exit 0, "built in" line, no error |
| Core/CLI tests (regression guard) | `npm test` | exit 0, all green |
| Bridge wired (main) | `grep -n "git.checkpoint" apps/desktop/electron/main.js` | one match |
| Bridge wired (preload) | `grep -n "checkpoint" apps/desktop/electron/preload.cjs` | one match |
| UI calls it | `grep -n "api.git.checkpoint" apps/desktop/renderer/src/components/GitPanel.jsx` | ≥ one match |
| Manual smoke | `npm run dev` (Electron window opens) | see "Manual smoke" below |

Note on testing: the desktop renderer and Electron files are **not** covered by Vitest
(`vitest.config.js` includes only `packages/core` and `apps/cli`). `npm test` here is a
regression guard proving you did not break core/CLI; the real functional verification is the
**renderer build** + the **manual smoke checklist**.

## Scope

**In scope** (the only files you may modify):
- `apps/desktop/electron/main.js` (add 2 handler lines)
- `apps/desktop/electron/preload.cjs` (add 2 `window.api.git` methods)
- `apps/desktop/renderer/src/components/GitPanel.jsx` (add badge + checkpoint dialog/button)
- `apps/desktop/renderer/src/lib/utils.js` (add `fmt` helper — idempotent; skip if present)
- `package.json`, `apps/cli/package.json`, `packages/core/package.json` (version bump — Step 6)
- `CHANGELOG.md` (Step 6)

**Out of scope** (do NOT touch):
- `packages/core/**` — the core already has `gitCheckpoint`/`gitUncommittedCount`; no logic
  change is needed or allowed. If you think core needs changing, STOP.
- `packages/core/src/translations.js` — all keys already exist; adding any is out of scope.
- `apps/cli/**` — the CLI already has this workflow.
- The git **branch-switching / pull / clone** features — those are plan 013. Do not add them
  here.
- Any redesign of the GitPanel layout beyond the additions described. The desktop UI is an
  intentional draft; keep changes minimal and additive.

## Git workflow

This repo commits directly to `main` and **bumps the patch version on every task** (root +
`apps/cli` + `packages/core` `package.json`; `apps/desktop/package.json` is intentionally
NOT bumped) plus a `CHANGELOG.md` entry — see `CLAUDE.md`. Conventional Commits, English, **no
`Co-Authored-By` footer**. Example from `git log`: `feat(git): selectable checkpoint target branch`.

- Make the change, then do Step 6 (version + changelog), then commit:
  `feat(desktop): add git checkpoint action and pending-versions indicator`
- **Do NOT `git push`** — leave pushing/merging to the maintainer.

## Steps

### Step 1: Ensure the `fmt` interpolation helper exists (idempotent)

In `apps/desktop/renderer/src/lib/utils.js`, if there is **no** `export function fmt`, add
this after `fmtDate`:
```js
// Podstawienie tokenów {name} w stringach i18n (renderer nie importuje tfmt z core).
export function fmt(str, params = {}) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}
```
This plan does not use `fmt` directly, but plans 012/013/014 do; adding it here once keeps
them independent. If it already exists, leave it.

**Verify**: `grep -n "export function fmt" apps/desktop/renderer/src/lib/utils.js` → exactly one match.

### Step 2: Bridge `gitCheckpoint` and `gitUncommittedCount` in the main process

In `apps/desktop/electron/main.js`, inside the `handlers` object, add these two lines
immediately after the `'git.push'` line:
```js
    'git.checkpoint': (data) => ctrl.gitCheckpoint(data && data.message, data && data.target),
    'git.uncommittedCount': () => ctrl.gitUncommittedCount(),
```

**Verify**: `grep -n "git.checkpoint\|git.uncommittedCount" apps/desktop/electron/main.js` → two matches.

### Step 3: Expose them on `window.api.git` in preload

In `apps/desktop/electron/preload.cjs`, inside the `git: { ... }` object, add after `push`:
```js
    checkpoint: (data) => invoke('git.checkpoint', data),
    uncommittedCount: () => invoke('git.uncommittedCount'),
```

**Verify**: `grep -n "checkpoint\|uncommittedCount" apps/desktop/electron/preload.cjs` → two matches.

### Step 4: Show pending versions in `GitPanel`

In `apps/desktop/renderer/src/components/GitPanel.jsx`, in the badges row (the
`<div className="flex flex-wrap items-center gap-2 text-sm">` block shown in Current state),
add — right after the `git.commitCount` success badge — a warning badge that appears only
when there are uncommitted versions:
```jsx
                {git.ahead > 0 && <Badge variant="warning" className="gap-1">{git.branch} · +{git.ahead} {t.Versions}</Badge>}
```
`Badge` is already imported. `git.ahead` and `git.branch` already arrive from
`api.git.status()` (see Current state).

**Verify**: `grep -n "git.ahead" apps/desktop/renderer/src/components/GitPanel.jsx` → one match.

### Step 5: Add the Checkpoint button + message dialog

Goal: a "Zatwierdź wersję" button that opens a small dialog with a commit-message input and,
on submit, calls `api.git.checkpoint({ message })` then reloads status. Disabled when there
is nothing to publish (`git.ahead === 0 && !git.dirty`).

5a. Extend the imports:
- Add `useState`/`useEffect` are already imported from `react`.
- Add `GitMerge` to the `lucide-react` import line (it becomes):
```jsx
import { GitBranch, GitCommit, History, UploadCloud, RotateCcw, Power, Loader2, Cloud, GitMerge } from 'lucide-react';
```
- Add the Dialog imports near the other `@/components/ui/*` imports:
```jsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
```

5b. Add local state near the existing `useState` lines (after `const [busy, setBusy] = useState(false);`):
```jsx
  const [cpOpen, setCpOpen] = useState(false);
  const [cpMsg, setCpMsg] = useState('');
```

5c. Add a handler alongside the existing `push`/`restore` handlers:
```jsx
  const checkpoint = async () => {
    setBusy(true);
    try {
      const s = await call(() => api.git.checkpoint({ message: cpMsg || 'Checkpoint' }));
      setGit(s);
      setCpOpen(false);
      setCpMsg('');
      await reload();
    } finally { setBusy(false); }
  };
```

5d. Render the button + dialog. Put the button in the remote/push row's button group (next
to Push), so it sits with the publish-oriented actions. Add this Button immediately before
the existing Push `<Button ...>Push</Button>`:
```jsx
                  <Button onClick={() => setCpOpen(true)} disabled={busy || (git.ahead === 0 && !git.dirty)}>
                    <GitMerge className="h-4 w-4" /> {t.GitCheckpoint}
                  </Button>
```
And add the dialog once, just before the closing `</>` of the active branch (anywhere inside
the active `<>...</>` is fine; placing it right after the remote/push `</div>` block is clean):
```jsx
              <Dialog open={cpOpen} onOpenChange={setCpOpen}>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t.GitCheckpointTitle}</DialogTitle></DialogHeader>
                  <div className="space-y-1.5">
                    <Label>{t.GitCheckpointMessageField}</Label>
                    <Input value={cpMsg} onChange={(e) => setCpMsg(e.target.value)} autoFocus />
                  </div>
                  <DialogFooter>
                    <Button variant="secondary" onClick={() => setCpOpen(false)}>{t.Cancel}</Button>
                    <Button disabled={busy} onClick={checkpoint}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />} {t.Save}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
```
`Input` and `Label` are already imported in `GitPanel.jsx`.

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0 (no JSX/import errors).
And `grep -n "api.git.checkpoint" apps/desktop/renderer/src/components/GitPanel.jsx` → one match.

### Step 6: Version bump + changelog (repo convention)

Read the current `version` from `package.json` (root) and increment the **patch** by 1 in all
three: `package.json`, `apps/cli/package.json`, `packages/core/package.json` (they are always
in sync; `apps/desktop/package.json` is intentionally left alone). Then add a new section at
the top of `CHANGELOG.md` (under the `# Changelog` heading):
```
## [X.Y.Z] — 2026-06-29
### Added
- Desktop: git "checkpoint" action to publish accumulated versions (wip → target branch), with a pending-versions indicator. Brings desktop git to parity with the CLI.
```
(Use the new version for `X.Y.Z` and today's date.)

**Verify**: `node -e "const a=require('./package.json').version,b=require('./apps/cli/package.json').version,c=require('./packages/core/package.json').version;if(a!==b||b!==c)throw new Error('version mismatch: '+a+' '+b+' '+c);console.log('synced',a)"`
→ prints `synced X.Y.Z`.

## Test plan

There is no automated desktop test harness (Vitest excludes `apps/desktop`). Verification is:

1. **Renderer build** (compile gate): `npm run build:renderer --workspace @liquidflow/desktop`
   → exit 0.
2. **Regression guard**: `npm test` → all green (you changed no core/CLI file, so this must
   stay green; if it goes red, you edited something out of scope).
3. **Manual smoke** (`npm run dev`, a real Comarch shop or the saved one):
   - Connect → pick an unlocked template → go to the **Git / backup** tab.
   - If no repo: click **Włącz wersjonowanie** (enable). Repo initializes.
   - Edit a template file locally and save → wait ~3 s (auto-commit debounce). The **+N
     versions** warning badge appears (N ≥ 1), showing the target branch name.
   - Click **Zatwierdź wersję**, type a message, **Zapisz**. The badge's N drops (work moved
     onto the target branch). The version history list updates.
   - With a remote configured + a checkpoint done, **Push** now succeeds and the remote
     receives the checkpoint commit (previously it pushed an empty target).

Do **not** claim the feature works without running the manual smoke at least through the
"badge appears → checkpoint → badge drops" sequence.

## Done criteria

ALL must hold:

- [ ] `npm run build:renderer --workspace @liquidflow/desktop` exits 0
- [ ] `npm test` exits 0 (no core/CLI regression)
- [ ] `grep -n "git.checkpoint" apps/desktop/electron/main.js` → 1 match
- [ ] `grep -n "checkpoint" apps/desktop/electron/preload.cjs` → 1 match
- [ ] `grep -n "api.git.checkpoint" apps/desktop/renderer/src/components/GitPanel.jsx` → 1 match
- [ ] `grep -n "git.ahead" apps/desktop/renderer/src/components/GitPanel.jsx` → 1 match
- [ ] Versions synced across the three `package.json` (verify command in Step 6 prints `synced …`)
- [ ] `CHANGELOG.md` has a new top section for the bumped version
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 011 updated
- [ ] Manual smoke (badge appears → checkpoint → badge drops) performed and confirmed

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (codebase drifted since `49dbf68`).
- `gitStatus()` no longer returns `ahead` or `branch` (the badge would render nothing —
  re-read `packages/core/src/controller.js` around line 432 and report).
- `npm run build:renderer` fails twice after a reasonable fix attempt.
- You find yourself wanting to edit any `packages/core/**` file — the core already has the
  needed methods; needing a core change means the plan's assumption is wrong.
- The checkpoint call throws `NoGitRepository` / `NoActiveTemplate` during smoke even though a
  repo exists and a template is active — report the exact message instead of guessing.

## Maintenance notes

- When the desktop UI is eventually redesigned, keep the **target-branch / ahead** concept
  visible — `git.branch` is the *target* stream, never the hidden `liquidflow/wip`; never
  surface the wip branch in the UI (the core deliberately hides it).
- Plan 013 (pull / branch switch / clone) builds on the same `GitPanel` and reuses the
  `fmt` helper from Step 1 and the Dialog pattern from Step 5. If 013 lands after this, the
  checkpoint **target** picker (publish to a different branch) can be added by passing
  `target` to `api.git.checkpoint({ message, target })` — the bridge already forwards it.
- Reviewer should scrutinize: the Checkpoint button's `disabled` predicate
  (`git.ahead === 0 && !git.dirty`) — it must not let a no-op checkpoint run, and must not
  block a legitimate one when there are pending versions.
- Deferred out of this plan: making **Push** also auto-checkpoint, and a checkpoint **target
  picker**. Kept out to stay minimal; revisit with plan 013 or the UI redesign.
