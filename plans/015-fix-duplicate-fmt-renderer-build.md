# Plan 015: Fix duplicate `fmt` export breaking the desktop renderer build

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the file listed in scope. If any STOP condition occurs, stop and report.

## Status

- **Priority**: P0 (build on `main` is currently broken)
- **Effort**: XS
- **Risk**: LOW (delete one duplicate function; behavior-identical for all callers)
- **Depends on**: none
- **Category**: bug / regression (introduced by merging 011 + 012)
- **Planned at**: commit `31a13b9`, 2026-07-01

## Why this matters

`apps/desktop/renderer/src/lib/utils.js` declares `export function fmt` **twice**
(once from plan 011, once from plan 012 — each added it "idempotently" in its own
worktree, but the two merges collide on `main`). Two exported function
declarations with the same name is a redeclaration error; `vite build` fails:

```
Identifier 'fmt' has already been declared
```

so `npm run build:renderer` exits non-zero on `main`. This blocks the desktop
build and every downstream desktop plan's verification gate. The fix is to keep
one definition and delete the other.

## Current state (verbatim, `apps/desktop/renderer/src/lib/utils.js`)

```js
// Interpolacja tokenów {key} w stringu tłumaczenia (odpowiednik tfmt z core, ale
// w rendererze bez importu core).
export function fmt(str, params) {
  if (!str || !params) return str || '';
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

export function fmtDate(iso) {
  ...
}

// Podstawienie tokenów {name} w stringach i18n (renderer nie importuje tfmt z core).
export function fmt(str, params = {}) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}
```

Both callers (`ConflictsPanel.jsx`, `DiffDialog.jsx`) always pass an existing
token param, so either implementation produces identical output — this is a safe
dedupe, not a behavior change.

## Scope

**In scope**:
- `apps/desktop/renderer/src/lib/utils.js` — remove the SECOND `fmt` (the one with
  the `// Podstawienie tokenów {name}` comment and `params = {}` default), keeping
  the first `fmt` and `fmtDate`.
- `package.json`, `apps/cli/package.json`, `packages/core/package.json` (version bump).
- `CHANGELOG.md`.

**Out of scope**: every other file. Do NOT touch `GitPanel.jsx`, the bridge, or
any component. Do NOT change the surviving `fmt`'s body.

## Steps

### Step 1: Delete the duplicate `fmt`

In `apps/desktop/renderer/src/lib/utils.js`, delete the second definition — the
block starting with the comment `// Podstawienie tokenów {name} w stringach i18n`
through its closing `}`. Keep the first `fmt` (lines with the
`// Interpolacja tokenów {key}` comment) and `fmtDate` untouched.

**Verify**: `grep -c "export function fmt(" apps/desktop/renderer/src/lib/utils.js` → `1`.

### Step 2: Build the renderer

**Verify**: `npm run build:renderer --workspace @liquidflow/desktop` → exit 0.

### Step 3: Regression guard

**Verify**: `npm test` → exit 0, green.

### Step 4: Version bump + changelog

Increment the patch version by 1 in `package.json`, `apps/cli/package.json`,
`packages/core/package.json` (leave `apps/desktop/package.json`). Add to
`CHANGELOG.md` top:
```
## [X.Y.Z] — 2026-07-01
### Fixed
- Desktop: remove a duplicate `fmt` export in the renderer utils that broke `vite build` (introduced by merging the 011 and 012 desktop plans).
```
**Verify**: `node -e "const a=require('./package.json').version,b=require('./apps/cli/package.json').version,c=require('./packages/core/package.json').version;if(a!==b||b!==c)throw new Error('mismatch');console.log('synced',a)"`
→ `synced X.Y.Z`.

## Git workflow

Commit to the worktree branch. Conventional Commits, English, no `Co-Authored-By`.
Suggested: `fix(desktop): remove duplicate fmt export breaking renderer build`.
**Do NOT `git push`.**

## Done criteria

- [ ] `grep -c "export function fmt(" apps/desktop/renderer/src/lib/utils.js` → `1`
- [ ] `npm run build:renderer --workspace @liquidflow/desktop` exits 0
- [ ] `npm test` exits 0
- [ ] Versions synced across the three `package.json`; `CHANGELOG.md` updated
- [ ] No files outside the in-scope list modified (`git status`)

## STOP conditions

Stop and report if:
- `utils.js` does not contain two `fmt` declarations (someone already fixed it).
- Removing the second `fmt` still leaves the build failing (a different error).
- `npm test` is red for a reason unrelated to this change.
