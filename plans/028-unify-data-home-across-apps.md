# Plan 028: Unify the data home across all apps (fix desktop `LIQUID_FLOW_HOME`)

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done (unless a
> reviewer maintains the index).
>
> **Drift check (run first)**:
> `git log --oneline -3` and confirm `apps/desktop/electron/main.js:12` still reads
> `process.env.LIQUID_FLOW_HOME = process.env.LIQUID_FLOW_HOME || app.getPath('userData');`
> and `packages/core/src/store.js:14` still declares `function defaultAppDir()`
> (no `export`). On mismatch, re-read before editing; if the fix is already
> present, STOP and report.

## Status

- **Priority**: P1 (this is a **correctness bug** — it defeats the entire point of
  plans 022–025: the apps do **not** share state)
- **Effort**: S
- **Risk**: MED (Electron main process + a core export; keep the change minimal and
  additive per the "desktop is a draft" rule)
- **Depends on**: plans 022–025 (DONE).
- **Category**: correctness / architecture
- **Planned at**: `e79d473`

## The bug (observed)

After migrating all three apps to the shared daemon, `npm run dev` (desktop) and
`npm run cli` **show different saved shops**, and the same shop+template shows
"up to date" in one and "conflicts" in the other. They are **not** sharing a
daemon — because they resolve **different data directories**, so each spawns its
**own** daemon with its **own** `config.json`, `Shops/`, and `daemon.sock`.

Root cause, confirmed on disk:

- **CLI and MCP** set no `LIQUID_FLOW_HOME`, so `store.js` uses
  `defaultAppDir()` → macOS `~/Library/Application Support/LiquidFlow`. This dir
  holds the real config (e.g. shop `walter`).
- **Desktop** (`apps/desktop/electron/main.js:12`) pins
  `LIQUID_FLOW_HOME = app.getPath('userData')`. Electron derives `userData` from
  the **app name**, which is `@liquidflow/desktop` in `npm run dev` (→
  `~/Library/Application Support/@liquidflow`) and the packaged `productName`
  `Liquid Flow` (→ `~/Library/Application Support/Liquid Flow`) when built —
  **neither equals `LiquidFlow`**. On this machine the divergence left stray data
  dirs: `@liquidflow`, `Liquid Flow`?, `LiquidSyncMac`, `liquid-sync`, `Electron`.

The `daemonSocketPath()` (`store.js:114`) is derived from `APP_DIR`, so different
homes ⇒ different sockets ⇒ different daemons ⇒ no sharing. The daemon migration
merely made a pre-existing latent split (each app always used its own dir) into a
**visible correctness failure**, because now the apps are *supposed* to share.

**The only cross-process-stable home is the core's `defaultAppDir()`** — the CLI
and MCP can't call Electron's `app.getPath`, so the desktop must conform to the
core default, not the other way around.

## Current state (verified at `e79d473`)

- **`packages/core/src/store.js:14-23`**: `defaultAppDir()` is a **private,
  env-independent** function returning the per-OS canonical path (macOS
  `~/Library/Application Support/LiquidFlow`, win32 `%APPDATA%\LiquidFlow`, linux
  `$XDG_CONFIG_HOME/liquid-flow`). It is **not** exported. Line 25:
  `const APP_DIR = process.env.LIQUID_FLOW_HOME || defaultAppDir();`.
- **`packages/core/index.js:9`**: `export * as store from './src/store.js';` —
  the barrel re-exports the whole `store` namespace, but `defaultAppDir` is not a
  member of it (it's a private function, not `export`ed), so `store.defaultAppDir`
  is currently `undefined`.
- **`apps/desktop/electron/main.js`** is ESM (`import ... from 'electron'`). Line 4
  imports `app`. Line 12 sets `LIQUID_FLOW_HOME` to `app.getPath('userData')`
  **before** the backend is imported. Core is imported **lazily** inside
  `getController()` (line 23: `await import('@liquidflow/core')`), deliberately not
  at module top.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests (gate) | `npm test` | exit 0, green |
| Desktop build (compile check) | `npm run build --workspace @liquidflow/desktop` | exit 0 |
| Manual dev run | `npm run dev` | app launches, shows the **same** shops as CLI |
| Manual CLI run | `npm run cli` | same shops as desktop |

## Scope

**In scope**:
- `packages/core/src/store.js` — add `export` to `defaultAppDir` (make it public).
- `packages/core/index.js` — re-export `defaultAppDir` as a **named top-level
  export** so `main.js` can import it without pulling the barrel's heavy modules is
  not achievable through `store.*`; add `export { defaultAppDir } from './src/store.js';`.
- `packages/core/src/store.test.js` (new or existing) — a test asserting
  `defaultAppDir()` ignores `LIQUID_FLOW_HOME` and ends with the canonical folder
  name for the platform.
- `apps/desktop/electron/main.js` — line 12: pin `LIQUID_FLOW_HOME` to
  `defaultAppDir()` instead of `app.getPath('userData')`.
- Four `package.json` version bumps + `CHANGELOG.md`.

**Out of scope (hard)**:
- **Migrating existing scattered data** (`@liquidflow`, `liquid-sync`,
  `LiquidSyncMac`, …) into `LiquidFlow`. This plan unifies the **path** going
  forward; it does not move old shops. (See Maintenance notes — the user re-adds
  any missing shop once, in any app, and it's then shared.) Do not write a data
  migrator here.
- `apps/desktop/renderer/**`, `preload.cjs` — no UI/bridge changes.
- Changing `app.getPath('userData')` for Electron's **own** cache/cookies — leave
  Electron's internal storage where it is; only the Liquid Flow data home moves.
- `apps/cli/**`, `apps/mcp/**` — they already use the default correctly.

## Git workflow

- Branch: `advisor/028-unify-data-home-across-apps`.
- Conventional Commits, English, **no `Co-Authored-By`**. Suggested:
  `fix(desktop): pin data home to core defaultAppDir so all apps share one daemon`.
- Bump all four `package.json` + `CHANGELOG.md` (`### Fixed`).

## Steps

### Step 1: Export `defaultAppDir` from core

In `packages/core/src/store.js`, change the function declaration on line 14 from:

```js
function defaultAppDir() {
```

to:

```js
export function defaultAppDir() {
```

Leave the body unchanged. `APP_DIR` on line 25 still calls it — no other change.

Then in `packages/core/index.js`, add a named re-export next to the existing
`store` export (line 9):

```js
export { defaultAppDir } from './src/store.js';
```

This makes `import { defaultAppDir } from '@liquidflow/core'` work.

**Verify**: `node -e "import('@liquidflow/core').then(m=>console.log(typeof m.defaultAppDir, m.defaultAppDir()))"`
→ prints `function` and a path ending in `LiquidFlow` (macOS) — and it must be the
**same** regardless of any `LIQUID_FLOW_HOME` env value (it ignores env).

### Step 2: Point the desktop at `defaultAppDir()`

In `apps/desktop/electron/main.js`, add a **static** top-level import of the
helper (near the other imports, after line 6) — the daemon runs backend code
anyway, so importing the helper at startup is acceptable:

```js
import { defaultAppDir } from '@liquidflow/core';
```

Then change line 12 from:

```js
process.env.LIQUID_FLOW_HOME = process.env.LIQUID_FLOW_HOME || app.getPath('userData');
```

to:

```js
// Wszystkie trzy apki muszą wskazywać ten sam katalog danych, żeby dzielić
// jednego demona. app.getPath('userData') zależy od nazwy aplikacji (inne w dev
// i w buildzie) i NIGDY nie pokrywa się z domyślnym katalogiem CLI/MCP — dlatego
// przypinamy kanoniczny defaultAppDir() z rdzenia. Jawny LIQUID_FLOW_HOME wciąż
// ma pierwszeństwo (testy/override).
process.env.LIQUID_FLOW_HOME = process.env.LIQUID_FLOW_HOME || defaultAppDir();
```

`defaultAppDir()` is env-independent, so import ordering does not matter (unlike
reading `store.paths.APP_DIR`, which would bake in whatever env was set at import
time — do **not** use that). Keeping the `process.env.LIQUID_FLOW_HOME || …`
precedence means an explicitly-set env (e.g. a test harness, or a user pointing
all apps at a custom dir) still wins for all three apps consistently.

> If the static `import { defaultAppDir }` measurably slows Electron startup or
> causes a load-order problem (it should not — `store.js` only pulls
> `node:fs/path/os/crypto`), the fallback is to inline the identical per-OS switch
> from `store.js:14-23` directly in `main.js`. Prefer the import (DRY); inline only
> if the import breaks startup, and say so in NOTES.

**Verify**: `grep -n "getPath('userData')" apps/desktop/electron/main.js` → no
match for the `LIQUID_FLOW_HOME` line (Electron may still use `userData`
internally elsewhere — that's fine; only line 12's assignment must change).
`grep -n "defaultAppDir" apps/desktop/electron/main.js` → both the import and the
assignment.

### Step 3: Test the canonical dir contract

Add to `packages/core/src/store.test.js` (create it if absent; follow the style of
the sibling `*.test.js` files — Vitest, ESM, `import { defaultAppDir } from './store.js'`):

```js
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { defaultAppDir } from './store.js';

describe('defaultAppDir', () => {
  it('ignores LIQUID_FLOW_HOME and returns the canonical per-OS dir', () => {
    const before = process.env.LIQUID_FLOW_HOME;
    process.env.LIQUID_FLOW_HOME = '/tmp/some/override';
    try {
      const dir = defaultAppDir();
      expect(dir).not.toBe('/tmp/some/override');
      const leaf = path.basename(dir);
      // macOS/Windows → 'LiquidFlow'; Linux → 'liquid-flow'
      expect(['LiquidFlow', 'liquid-flow']).toContain(leaf);
    } finally {
      if (before === undefined) delete process.env.LIQUID_FLOW_HOME;
      else process.env.LIQUID_FLOW_HOME = before;
    }
  });
});
```

> **Note on test isolation**: the `tmpHome.js` setup file sets `LIQUID_FLOW_HOME`
> to a tmp dir for every test file (see CLAUDE.md → Testy). That's exactly why the
> assertion checks `defaultAppDir()` **ignores** that env var. If your test file
> instead needs `store`'s `APP_DIR` behavior, that's a different test — this one is
> only about the pure `defaultAppDir()` contract.

**Verify**: `npm test` runs this test green.

### Step 4: Version bump + CHANGELOG + gate

Bump all four `package.json`; add a `CHANGELOG.md` `### Fixed` entry, e.g.:
"Desktop now uses the same canonical data directory (`defaultAppDir`) as the CLI
and MCP, so all three attach to one shared daemon and see the same shops, logs,
and sync state — previously the desktop pinned Electron's `userData`, a different
folder per app name/build."

Run the gate + a desktop build.

**Verify**: `npm test` exit 0; `npm run build --workspace @liquidflow/desktop`
exit 0.

## Test plan

- New unit test (Step 3) is the automated regression guard for the path contract.
- **Manual acceptance** (record in NOTES — no automated desktop test exists):
  1. **Kill any running daemons first** so stale ones on old sockets don't confuse
     the check: `pkill -f liquidflow-daemon` (macOS/Linux). Remove any stale
     socket if present: `rm -f "$HOME/Library/Application Support/LiquidFlow/daemon.sock"`.
  2. `npm run cli` — note the shops listed (`/connect`).
  3. `npm run dev` — the desktop must list the **same** shops.
  4. In one app, connect a shop + select a template; the **other** app shows the
     same session/logs live, and the same template reads the **same** conflict
     state (not "up to date here, conflicts there").
  5. `ls "$HOME/Library/Application Support/LiquidFlow/daemon.sock"` → exactly one
     socket; both apps attached to it (no second daemon under `@liquidflow` etc.).

## Done criteria

- [ ] `packages/core/src/store.js` — `export function defaultAppDir()`.
- [ ] `packages/core/index.js` — `defaultAppDir` re-exported;
      `import('@liquidflow/core')` exposes it.
- [ ] `apps/desktop/electron/main.js` line 12 uses `defaultAppDir()`, not
      `app.getPath('userData')`; explicit `LIQUID_FLOW_HOME` still takes precedence.
- [ ] New `store.test.js` test green; `npm test` exit 0.
- [ ] `npm run build --workspace @liquidflow/desktop` exit 0.
- [ ] Manual: `npm run dev` and `npm run cli` show the **same** shops and share one
      `daemon.sock`; connecting/selecting in one is visible live in the other.
- [ ] No renderer/`preload.cjs` changes; `apps/cli`/`apps/mcp` untouched.
- [ ] Four `package.json` bumped; `CHANGELOG.md` updated; `plans/README.md` row.

## STOP conditions

- After the change, desktop and CLI **still** show different shops → a **stale
  daemon** from the old home is still running (didn't `pkill`), OR an explicit
  `LIQUID_FLOW_HOME` is exported in the shell/launch env overriding both — check
  `echo $LIQUID_FLOW_HOME` and kill old daemons; only if it still diverges with a
  clean env is the fix wrong — report the two resolved paths.
- The static `import { defaultAppDir }` breaks Electron startup (white screen /
  load error) → fall back to the inlined per-OS switch (Step 2 note) and report.
- Any renderer file needs changing → out of scope; report.
- You feel the need to migrate old data to make shops appear → out of scope; the
  user re-adds shops once. Do not build a migrator in this plan.

## Maintenance notes

- **Data migration is deliberately excluded.** After this lands, all apps read
  `~/Library/Application Support/LiquidFlow`. Shops previously saved only by the
  desktop (in `@liquidflow`/`liquid-sync`/`LiquidSyncMac`) won't appear; the user
  re-adds each shop once in any app and it's then shared everywhere. If a bulk
  move is ever wanted, that's a separate, explicit plan (copy `Shops/` + merge
  `config.json` `Shops[]`, de-duplicating by `Name`, re-encrypting passwords under
  the target dir's `.key`).
- **Packaged builds**: because the home no longer depends on Electron's app name,
  the built `.dmg`/`.exe` and `npm run dev` now use the **same** dir as the CLI —
  which is the intended behavior. Verify once on a real build that the daemon bin
  (`@liquidflow/core/bin/liquidflow-daemon.js`) still resolves inside the asar
  bundle (this is the separate packaging concern flagged in plan 025's maintenance
  notes — unrelated to this path fix, but worth checking on the same build).
- The `defaultAppDir` export is now public API of `@liquidflow/core`; keep its
  per-OS output stable (changing it would strand everyone's data under the old
  path).
