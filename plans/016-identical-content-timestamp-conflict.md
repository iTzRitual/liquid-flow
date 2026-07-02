# Plan 016: Make byte-identical timestamp conflicts self-explanatory and one-click resolvable (CLI)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 66595db..HEAD -- packages/core/src/syncEngine.js packages/core/src/translations.js apps/cli/src/components/DiffView.jsx apps/cli/src/commands.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches conflict resolution — a wrong reconcile could hide a real
  change; the content guard in Step 3 is the safety net and must not be skipped)
- **Depends on**: none (independent of plan 018, but 018 is cheaper — do it first)
- **Category**: bug / UX
- **Planned at**: commit `66595db`, 2026-07-01

## Why this matters

Conflict detection in this tool is **timestamp-only**: a `Timestamp` mismatch
fires when the local file's mtime differs from the stored meta baseline **or** the
remote `Date` differs — regardless of whether the file's *content* changed
(`SyncSession.refreshMismatches`, `syncEngine.js`). This is by design and cheap,
but it produces a confusing situation: after a user syncs the same template from a
second machine (e.g. a Linux box), every file's timestamp shifts, so all files are
flagged as conflicts **even though the bytes are identical**.

When the user opens the preview for such a conflict, they see
"⋯ N niezmienionych wierszy" and "Brak różnic" (No differences) — which reads like
"nothing here / is the tool broken?" The user in the field literally asked "is this
a bug?" It is not — their files are safe — but the UI never says so.

This plan makes that state explicit ("Identical content — only the timestamp
differs") **and** adds a byte-free, one-click **Reconcile** resolution that clears
the spurious conflict by re-stamping the metadata baseline, *without* re-uploading
or re-downloading unchanged bytes. Reconcile is guarded: it refuses (with a clear
message) if the content is not actually identical, so it can never silently hide a
real change.

## Current state

Files and their roles:
- `packages/core/src/syncEngine.js` — `SyncSession`: `previewConflict()` builds the
  diff preview; `command()` dispatches resolution verbs; `_download`/`_upload`
  re-stamp meta after transferring.
- `packages/core/src/translations.js` — flat `pl` / `en` string tables (single
  source of truth for all user-facing text). **Every new string needs a key in
  BOTH tables.**
- `apps/cli/src/components/DiffView.jsx` — the preview component; renders a summary
  line (`Brak różnic` when zero changes).
- `apps/cli/src/commands.js` — `fileOptions()` defines per-conflict-type action
  buttons; `runFileAction()` executes a chosen action via
  `ctrl.runCommand({ comm, file, type })`.
- `packages/core/src/controller.js` — `runCommand({ comm, file, type })` is a
  generic passthrough to `session.command(comm, file, type)` (line ~358), so a new
  verb needs **no** controller change.

**`previewConflict` today** (`syncEngine.js`, current lines ~472–501):

```js
  async previewConflict(file, type) {
    if (isImage(file.Name)) return { kind: 'binary', side: 'both' };
    let remoteBuf = null;
    if (type !== MismatchType.RemoteMissing) {
      const list = await this.client.liquidFilesGet({
        TemplateId: this.templateId, Mode: file.Mode, Name: file.Name,
      });
      remoteBuf = list[0]?.Template ?? null;
    }
    let localBuf = null;
    if (type !== MismatchType.LocalMissing) {
      const p = store.localFilePath(this.shopName, this.templateId, file.Mode, file.Name);
      if (fs.existsSync(p)) localBuf = fs.readFileSync(p);
    }
    const hasBinary = (buf) => buf instanceof Buffer && buf.includes(0);
    if (hasBinary(remoteBuf) || hasBinary(localBuf)) {
      const side = !localBuf ? 'remoteOnly' : !remoteBuf ? 'localOnly' : 'both';
      return { kind: 'binary', side };
    }
    const local = localBuf ? localBuf.toString('utf8') : null;
    const remote = remoteBuf ? remoteBuf.toString('utf8') : null;
    const diff = lineDiff(local ?? '', remote ?? '');
    if (diff.tooLarge) return { kind: 'tooLarge' };
    return { kind: 'text', local, remote, diff };
  }
```

**`command()` switch today** (`syncEngine.js`, current lines ~379–419) — verbs:
`refr`/`refresh`, `download`, `upload`, `removeLocal`, `removeRemote`, `downloadAll`,
`uploadAll`. Each `_download`/`_upload` ends by calling
`store.setMetaEntry(this.shopName, this.templateId, mode, name, localts, remoteDate)`.
Example re-stamp shape from `_upload` (line ~447):

```js
    store.setMetaEntry(this.shopName, this.templateId, file.Mode, file.Name, store.mtimeUtc(abs), remote ? remote.Date : null);
```

**Timestamp action buttons today** (`apps/cli/src/commands.js`, current lines
~169–175):

```jsx
    // Timestamp: oba istnieją → pobierz z serwera albo wyślij z lokala
    return { options: [
      { label: t.ActionDownloadShort, value: 'download' },
      { label: t.ActionUploadShort, value: 'upload' },
      { label: t.ActionPreviewShort, value: 'preview' },
    ], initial: 2 };
```

`runFileAction` (line ~186) routes any non-`preview`, non-`removeLocal`,
non-`removeRemote` value straight through `exec()` (no confirmation) →
`ctrl.runCommand({ comm: value, file: m.File, type: m.Type })`. So `reconcile`
needs **no** new branch in `runFileAction`.

**DiffView summary today** (`apps/cli/src/components/DiffView.jsx`, current lines
~126–128):

```jsx
  const summary = (added === 0 && removed === 0)
    ? t.DiffNoChanges
    : tfmt(t.DiffSummary, { added, removed });
```

Repo conventions that apply here:
- **i18n hard rule** (`CLAUDE.md` → "Tłumaczenia"): every user-facing string is a
  key in both `pl` and `en`. Logs use the `tmsg('Key', params)` descriptor form
  (see `LogUploaded` / `LogDownloaded` usage in `syncEngine.js`). Thrown errors use
  `this.t.Key` (rendered at throw time).
- **The "identical" definition must be the SAME** in the preview flag and the
  reconcile guard: content is *identical* when the normalized line-diff
  (`lineDiff`, which already collapses CRLF/CR/LF — see `diff.js`) has **no** `add`
  or `del` rows. Do not use raw `Buffer.equals` — line-ending-only differences must
  count as identical (detection is timestamp-only, so re-stamping never resurfaces
  them). Centralize this so both sites agree.
- **Meta re-stamp shape**: `store.setMetaEntry(shop, templateId, mode, name,
  localMtime, remoteDate)` with `localMtime = store.mtimeUtc(abs)` and
  `remoteDate = remote.Date`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests (all) | `npm test` | exit 0, all green |
| Core sync tests | `npx vitest run packages/core/src/syncEngine.command.test.js` | all pass |
| i18n parity | `npx vitest run packages/core/src/translations.test.js` | all pass |
| Component test | `npx vitest run apps/cli/src/components/DiffView.test.jsx` | all pass |
| CLI flows | `npx vitest run apps/cli/src/commands.flows.test.js apps/cli/src/commands.test.js` | all pass |

`npm test` (Vitest) is the only gate — there is no typecheck/lint script.

**i18n parity self-check** (run after adding keys, from repo root):
`node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;console.log('untranslated:',Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k])))})"`
→ must print `untranslated: []`.

## Scope

**In scope**:
- `packages/core/src/syncEngine.js` (add `identical` to preview; add `reconcile`
  verb + `_reconcile`)
- `packages/core/src/translations.js` (5 new keys × pl/en)
- `apps/cli/src/components/DiffView.jsx` (identical summary message)
- `apps/cli/src/commands.js` (Reconcile action button for Timestamp conflicts)
- `packages/core/src/syncEngine.command.test.js` (new tests)
- `apps/cli/src/components/DiffView.test.jsx` (new test)

**Out of scope** (do NOT touch):
- `refreshMismatches` detection logic — do **not** try to auto-suppress identical
  conflicts during the poll. Reading every file's content on every `POLL_MS` tick
  would mean a SOAP body fetch per file per poll (heavy). Reconcile is on-demand by
  design.
- `apps/cli/src/components/ConflictList.jsx` — the render/layout is deliberately
  fragile (see `CLAUDE.md`). You are only adding a data option to the `options`
  array in `commands.js`; the component renders it generically. Do not edit the
  component.
- `apps/desktop/**` — desktop has its own preview (plan 012). Parity is a separate
  follow-up (see Maintenance notes).
- `controller.js` — `runCommand` is already a generic passthrough.

## Git workflow

- Work directly on `main`.
- Bump the patch version in all three `package.json` (root, `apps/cli`,
  `packages/core`); add a `CHANGELOG.md` entry (`### Added` for Reconcile,
  `### Fixed`/`### Changed` for the clearer message) under a new
  `## [X.Y.Z] — 2026-07-01` heading.
- Commit (Conventional Commits, English, **no `Co-Authored-By`**):
  `feat(cli): flag byte-identical timestamp conflicts and add a byte-free reconcile action`

## Steps

### Step 1: Add the five i18n keys (pl + en)

In `packages/core/src/translations.js`, add to the **`pl`** table (near the diff
keys, ~line 335) and the corresponding overrides to the **`en`** table (near
~line 635):

`pl`:
```js
  DiffIdentical: 'Zawartość identyczna — różni się tylko znacznik czasu',
  ActionReconcileShort: 'Uzgodnij',
  LogReconciled: 'Uzgodniono znacznik: {label}',
  ReconcileContentDiffers: 'Zawartość się różni — użyj Pobierz lub Wyślij',
  ReconcileNeedsBothSides: 'Uzgadnianie wymaga pliku po obu stronach',
```

`en`:
```js
  DiffIdentical: 'Identical content — only the timestamp differs',
  ActionReconcileShort: 'Reconcile',
  LogReconciled: 'Reconciled timestamp: {label}',
  ReconcileContentDiffers: 'Content differs — use Download or Upload',
  ReconcileNeedsBothSides: 'Reconcile requires the file on both sides',
```

**Verify**: the i18n parity self-check command (above) prints `untranslated: []`,
and `npx vitest run packages/core/src/translations.test.js` passes.

### Step 2: Annotate the preview with an `identical` flag

In `packages/core/src/syncEngine.js`, change the final return of `previewConflict`
to compute and include `identical` (both sides present AND the normalized diff has
no changes):

```js
    const diff = lineDiff(local ?? '', remote ?? '');
    if (diff.tooLarge) return { kind: 'tooLarge' };
    const identical = local != null && remote != null && !diff.some((d) => d.type !== 'ctx');
    return { kind: 'text', local, remote, diff, identical };
```

**Verify**: `npx vitest run packages/core/src/syncEngine.command.test.js` still
passes (existing tests don't assert on the new field yet).

### Step 3: Add the guarded `reconcile` verb

In `packages/core/src/syncEngine.js`, add a case to the `command()` switch (after
`removeRemote`, before `downloadAll`):

```js
          case 'reconcile':
            await this._reconcile(fileArg);
            break;
```

Then add the `_reconcile` method near `_upload`/`_download` (it re-stamps meta ONLY
when content is identical — same definition as the preview flag):

```js
  // Uzgodnij znacznik czasu bez transferu bajtów: gdy zawartość jest identyczna
  // (konflikt wynika tylko z rozjechanych mtime/Date — np. sync z innej maszyny),
  // nadpisujemy meta bieżącymi wartościami i konflikt znika. GUARD: jeśli treść
  // się różni, RZUCAMY — nie chowamy realnej zmiany za re-stampem meta.
  async _reconcile(file) {
    const abs = store.localFilePath(this.shopName, this.templateId, file.Mode, file.Name);
    if (!fs.existsSync(abs)) throw new Error(this.t.ReconcileNeedsBothSides);
    const list = await this.client.liquidFilesGet({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name });
    const remote = list[0];
    if (!remote || !(remote.Template instanceof Buffer)) throw new Error(this.t.ReconcileNeedsBothSides);
    const localText = fs.readFileSync(abs).toString('utf8');
    const remoteText = remote.Template.toString('utf8');
    const diff = lineDiff(localText, remoteText);
    const identical = !diff.tooLarge && !diff.some((d) => d.type !== 'ctx');
    if (!identical) throw new Error(this.t.ReconcileContentDiffers);
    store.setMetaEntry(this.shopName, this.templateId, file.Mode, file.Name, store.mtimeUtc(abs), remote.Date);
    logOk(tmsg('LogReconciled', { label: this._label(file.Mode, file.Name) }));
    this._notify('reconcile', file.Mode, file.Name);
  }
```

Confirm `lineDiff`, `store`, `fs`, `tmsg`, `logOk` are already imported at the top
of `syncEngine.js` (they are used elsewhere in the file — do not add duplicate
imports).

**Verify**: `node -e "import('@liquidflow/core').then(()=>console.log('import ok'))"`
→ prints `import ok` (no syntax error).

### Step 4: Surface the identical message in the preview

In `apps/cli/src/components/DiffView.jsx`, change the `summary` computation so an
identical preview says so explicitly:

```jsx
  const summary = preview?.identical
    ? t.DiffIdentical
    : (added === 0 && removed === 0)
      ? t.DiffNoChanges
      : tfmt(t.DiffSummary, { added, removed });
```

(Leave the folded-context rendering unchanged.)

**Verify**: `npx vitest run apps/cli/src/components/DiffView.test.jsx` → still
passes (add the new assertion in Step 6).

### Step 5: Add the Reconcile action button to Timestamp conflicts

In `apps/cli/src/commands.js`, add a `reconcile` option to the Timestamp branch of
`fileOptions()` and keep `preview` as the (safe, non-destructive) default by
pointing `initial` at it:

```jsx
    // Timestamp: oba istnieją → pobierz / wyślij / uzgodnij (gdy tylko znacznik) / podgląd
    return { options: [
      { label: t.ActionDownloadShort, value: 'download' },
      { label: t.ActionUploadShort, value: 'upload' },
      { label: t.ActionReconcileShort, value: 'reconcile' },
      { label: t.ActionPreviewShort, value: 'preview' },
    ], initial: 3 };
```

No change to `runFileAction` is needed — `reconcile` is non-destructive, so it
flows through the default `exec()` path (no confirmation), calling
`ctrl.runCommand({ comm: 'reconcile', file: m.File, type: m.Type })`.

**Verify**: `npx vitest run apps/cli/src/commands.test.js apps/cli/src/commands.flows.test.js`
→ all pass (the safe-default assertion still holds: `initial` points at `preview`,
never a deleting action).

### Step 6: Tests

Add tests (details in the Test plan below), then run the full gate.

**Verify**: `npm test` → exit 0, all green, including the new cases.

## Test plan

**Core — `packages/core/src/syncEngine.command.test.js`** (model on the existing
`previewConflict()` and command tests in this file; they use the mock SOAP server
and a real `store`, isolated by a unique shop name):

- `previewConflict` returns `identical: true` when local and remote bytes are the
  same (seed identical local file + mock `Liquid_FilesGet` returning the same
  content); returns `identical: false`/absent when they differ.
- `command('reconcile', file)` on identical content: re-stamps meta and, on a
  subsequent `refreshMismatches`, the file is **no longer** a Timestamp conflict.
  Assert via `store.getMetaEntry` or by checking `session.mismatches` is empty for
  that file after reconcile.
- `command('reconcile', file)` on **differing** content: rejects — assert the
  promise rejects with a message equal to `t.ReconcileContentDiffers`, and meta is
  **unchanged** (conflict still present). This is the safety guard — it must be
  covered.

**CLI — `apps/cli/src/components/DiffView.test.jsx`** (model on the existing
`'diff bez zmian → summary "Brak różnic"'` test):

- A preview with `identical: true` renders `t.DiffIdentical` (and does **not** rely
  on `t.DiffNoChanges` for that case).

Verification: `npm test` → all pass, including the 4 new assertions above.

## Done criteria

ALL must hold:

- [ ] i18n parity self-check prints `untranslated: []`; `translations.test.js` passes
- [ ] `previewConflict` returns `identical` and `_reconcile` exists with the content guard
- [ ] `command('reconcile', …)` re-stamps meta on identical content and clears the
      conflict; rejects with `ReconcileContentDiffers` on differing content (tests prove both)
- [ ] DiffView shows `t.DiffIdentical` for an identical preview (test proves it)
- [ ] Timestamp conflict card offers a `Reconcile` action with `preview` as the default
- [ ] `npm test` exits 0, fully green
- [ ] Patch version bumped in all three `package.json`; `CHANGELOG.md` updated
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 016 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt doesn't match the live code (drift).
- `remote.Template` is not a `Buffer` at runtime (the reconcile guard assumes it is;
  `previewConflict` and `_download` both treat it as one) — if a test shows it is a
  string or base64, report before changing the comparison.
- The safe-default assertion in `commands.test.js`/`commands.flows.test.js` fails —
  it means the cursor-default contract changed; do not "fix" it by moving the delete
  action, report instead.
- You find yourself needing to edit `ConflictList.jsx` or `refreshMismatches` — both
  are explicitly out of scope; report why.

## Maintenance notes

- **Reconcile is deliberately on-demand.** If a future change wants to auto-clear
  identical conflicts, it must solve the cost problem (content is not known during
  the timestamp-only poll) — e.g. a content hash cached in meta, compared cheaply.
  That's a separate, larger design; do not fold it in here.
- The "identical" definition lives in two places now (preview flag + reconcile
  guard) and **must stay in sync** — both use `lineDiff(...).some(d => d.type !==
  'ctx')`. If you change one, change both, or extract a shared helper in `diff.js`.
- **Desktop parity follow-up (deferred):** the desktop conflict UI (plan 012) shows
  the same timestamp conflicts and would benefit from the identical message +
  reconcile button. The `reconcile` verb is now in core, so the desktop only needs
  an IPC bridge line + a button — a small additive follow-up plan (matches the
  "desktop is a draft, keep it minimal/additive" constraint in memory).
- A reviewer should scrutinize the reconcile guard most: confirm a differing-content
  reconcile truly rejects and leaves meta untouched (no data-loss path).
