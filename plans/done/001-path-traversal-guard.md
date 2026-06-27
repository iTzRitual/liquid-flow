# Plan 001: Reject server-supplied file names that escape the template directory

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1599ef..HEAD -- packages/core/src/store.js packages/core/src/syncEngine.js packages/core/src/translations.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e1599ef`, 2026-06-27

## Why this matters

Template file names returned by the shop's SOAP service are written to disk
verbatim. The write path (`store.localFilePath` → `store.writeLocalFile`) joins
the server-supplied `Name` onto the local template directory **without any
`..`/traversal guard** — only the *read* side (`store.parseLocalPath`) filters
dangerous segments. A name like `../../../../tmp/evil` resolves **outside** the
data directory:

```
templateDir: …/LiquidFlow/Shops/MyShop/files/5
name:        ../../../../tmp/evil   →   resolved: …/tmp/evil   (escapes!)
```

So a malicious or compromised shop — or a man-in-the-middle, especially with
`LIQUID_FLOW_INSECURE=1` or an `http://localhost` URL — can make Liquid Flow
write arbitrary files anywhere the user can write (shell rc files, login items,
the app's own `config.json`, etc.) the moment a template is downloaded. The
client must treat SOAP-supplied path components as untrusted input. After this
plan, any file name that would escape the template/mode directory is rejected
and logged, and the rest of the download proceeds normally.

## Current state

Files involved:

- `packages/core/src/store.js` — local file persistence; the unguarded
  write helpers live here.
- `packages/core/src/syncEngine.js` — calls the write helpers with
  server-supplied `f.Name` during download (`_initialDownload`, `_download`).
- `packages/core/src/translations.js` — flat `pl`/`en` string tables; every
  user-facing string must have an entry in **both**.

**`store.js` — the unguarded write path** (`packages/core/src/store.js:112-143`):

```js
// Bezwzględna ścieżka pliku lokalnego dla danego (template, mode, name).
export function localFilePath(shopName, templateId, mode, name) {
  const parts = String(name).split('/').filter((p) => p.length);
  return path.join(templateDir(shopName, templateId), String(mode), ...parts);
}

// Z bezwzględnej ścieżki (wewnątrz templateDir) wyznacz {mode, name}.
export function parseLocalPath(shopName, templateId, absPath) {
  // … (read side — already filters dot-segments; do NOT change this)
}

export function writeLocalFile(shopName, templateId, mode, name, buffer) {
  const abs = localFilePath(shopName, templateId, mode, name);
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, buffer);
  return mtimeUtc(abs);
}

export function deleteLocalFile(shopName, templateId, mode, name) {
  const abs = localFilePath(shopName, templateId, mode, name);
  try { fs.unlinkSync(abs); } catch {}
}
```

Note `templateModeDir(shopName, templateId, mode)` already exists
(`store.js:105-107`) and returns `…/files/<id>/<mode>` — the directory a safe
name must stay inside.

**`syncEngine.js` — the sinks.** `_initialDownload` (`syncEngine.js:137-157`):

```js
  async _initialDownload() {
    this._progress({ phase: 'download', state: 'start' });
    const files = await this.client.liquidFilesGet({ TemplateId: this.templateId });
    const total = files.length;
    let done = 0;
    for (const f of files) {
      const localts = store.writeLocalFile(this.shopName, this.templateId, f.Mode, f.Name, f.Template || Buffer.alloc(0));
      store.setMetaEntry(this.shopName, this.templateId, f.Mode, f.Name, localts, f.Date);
      done++;
      if (done === total || done % 5 === 0) {
        this._progress({ phase: 'download', state: 'progress', done, total });
        await new Promise((r) => setImmediate(r));
      }
    }
    this._progress({ phase: 'download', state: 'done', count: total });
    logOk(tmsg('FilesDownloaded', { count: total }));
  }
```

`_download` (`syncEngine.js:377-385`):

```js
  async _download(file) {
    const list = await this.client.liquidFilesGet({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name });
    const f = list[0];
    if (!f) return;
    const localts = store.writeLocalFile(this.shopName, this.templateId, f.Mode, f.Name, f.Template || Buffer.alloc(0));
    store.setMetaEntry(this.shopName, this.templateId, f.Mode, f.Name, localts, f.Date);
    logOk(tmsg('LogDownloaded', { label: this._label(f.Mode, f.Name) }));
    this._notify('download', f.Mode, f.Name);
  }
```

`syncEngine.js` already imports what you need at the top
(`import { logInfo, logOk, logErr, tmsg } from './log.js';` and
`import * as store from './store.js';`) — no new imports required there.

**Conventions to match:**

- ESM, Node 20+. Code comments are in **Polish**; match the surrounding style.
- **Every user-facing string goes through `translations.js` in BOTH `pl` and
  `en`** (hard rule — see the file header at `translations.js:8-10`). Log
  producers pass an i18n descriptor `tmsg('Key', params)`, never a pre-built
  string. Example with a token, `translations.js:145` (pl) / `:390` (en):
  `LogDownloaded: 'Pobierz ✓ — {label}'` / `'Download ✓ — {label}'`.
- Tests live beside sources as `*.test.js`. Model new store tests on the
  existing `parseLocalPath` block in `packages/core/src/store.test.js:35-56`
  and new syncEngine tests on `packages/core/src/syncEngine.watcher.test.js`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` | exit 0 (only needed in a fresh worktree) |
| Tests | `npm test` | `Test Files … passed`, `Tests … passed`, exit 0 |
| Focused run | `npx vitest run packages/core/src/store.test.js packages/core/src/syncEngine.watcher.test.js packages/core/src/translations.test.js` | all pass |

There is **no** typecheck or lint script in this repo (plain ESM JS). `npm test`
(Vitest) is the verification gate and must be 100% green before committing.

## Scope

**In scope** (the only files you should modify):

- `packages/core/src/store.js`
- `packages/core/src/syncEngine.js`
- `packages/core/src/translations.js`
- `packages/core/src/store.test.js` (add tests)
- `packages/core/src/syncEngine.watcher.test.js` (add tests)

**Out of scope** (do NOT touch, even though they look related):

- `store.parseLocalPath` — the read/watch side already filters dot-segments;
  changing it risks the `.git`/`.DS_Store` exclusion that keeps git internals
  out of sync. Leave it exactly as is.
- `apps/desktop/**` — out of scope for this engagement entirely.
- The SOAP/XML parsing layer (`soap.js`, `xml.js`) — the fix belongs at the
  filesystem boundary, not the parser.

## Git workflow

- Branch: `advisor/001-path-traversal-guard`
- Conventional Commits in English, e.g.
  `fix(core): reject unsafe remote file paths (path traversal)`.
- **Do NOT add a `Co-Authored-By` footer** (the repo convention in `CLAUDE.md`
  explicitly forbids it).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a name-safety predicate and harden the write helpers in `store.js`

In `packages/core/src/store.js`, **immediately above** `writeLocalFile`
(currently line 133), add an exported predicate:

```js
// Czy nazwa pliku (pochodzi z odpowiedzi SOAP sklepu — NIEZAUFANA) trzyma się
// wewnątrz katalogu trybu szablonu? Odrzuca puste nazwy, NUL, separatory
// Windows ('\\') oraz segmenty '.'/'..', czyli wszystko, czym path.join mógłby
// uciec poza katalog danych (path traversal). Strona zapisu nie miała takiej
// bramki (czytająca parseLocalPath miała) — to jest ta bramka.
export function isSafeRelName(name) {
  const s = String(name);
  if (!s || s.includes('\0') || s.includes('\\')) return false;
  const parts = s.split('/').filter((p) => p.length);
  if (!parts.length) return false;
  return !parts.some((p) => p === '.' || p === '..');
}
```

Then change `writeLocalFile` to refuse unsafe names (hard backstop — defense in
depth even if a caller forgets to guard):

```js
export function writeLocalFile(shopName, templateId, mode, name, buffer) {
  if (!isSafeRelName(name)) throw new Error(`Unsafe file path rejected: ${name}`);
  const abs = localFilePath(shopName, templateId, mode, name);
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, buffer);
  return mtimeUtc(abs);
}
```

And make `deleteLocalFile` a no-op on unsafe names (so a crafted name can never
delete outside the template dir):

```js
export function deleteLocalFile(shopName, templateId, mode, name) {
  if (!isSafeRelName(name)) return;
  const abs = localFilePath(shopName, templateId, mode, name);
  try { fs.unlinkSync(abs); } catch {}
}
```

Leave `localFilePath` itself unchanged (other callers read through it).

**Verify**: `node -e "import('./packages/core/src/store.js').then(s=>{console.log(s.isSafeRelName('a/b.liquid'), s.isSafeRelName('../x'), s.isSafeRelName('a\\\\b'), s.isSafeRelName('..'), s.isSafeRelName(''))})"`
→ prints `true false false false false`

### Step 2: Add the `UnsafeRemotePath` i18n key in both `pl` and `en`

In `packages/core/src/translations.js`, in the **`pl`** table, add a line
immediately after `LogFileDeletedRemote` (currently line 148):

```js
  UnsafeRemotePath: 'Pominięto plik o niebezpiecznej ścieżce — {name}',
```

In the **`en`** table, add the matching line immediately after the `en`
`LogFileDeletedRemote` (currently line 393):

```js
  UnsafeRemotePath: 'Skipped file with unsafe path — {name}',
```

(Both carry the same `{name}` token, so the parity tests stay green.)

**Verify**: `node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');console.log(!!pl.UnsafeRemotePath,!!en.UnsafeRemotePath, pl.UnsafeRemotePath!==en.UnsafeRemotePath)})"`
→ prints `true true true`

### Step 3: Guard the download sinks in `syncEngine.js`

Replace the body of the `for` loop in `_initialDownload` (`syncEngine.js:142-154`)
so a malicious entry is skipped + logged, and progress still completes (note
`done++` now runs once per iteration, before the branch):

```js
    for (const f of files) {
      done++;
      if (!store.isSafeRelName(f.Name)) {
        logErr(tmsg('UnsafeRemotePath', { name: f.Name }));
      } else {
        const localts = store.writeLocalFile(this.shopName, this.templateId, f.Mode, f.Name, f.Template || Buffer.alloc(0));
        store.setMetaEntry(this.shopName, this.templateId, f.Mode, f.Name, localts, f.Date);
      }
      if (done === total || done % 5 === 0) {
        this._progress({ phase: 'download', state: 'progress', done, total });
        await new Promise((r) => setImmediate(r));
      }
    }
```

In `_download` (`syncEngine.js:377-385`), add the guard right after the `if (!f) return;`:

```js
    if (!f) return;
    if (!store.isSafeRelName(f.Name)) { logErr(tmsg('UnsafeRemotePath', { name: f.Name })); return; }
```

**Verify**: `npx vitest run packages/core/src/syncEngine.watcher.test.js` → all
existing tests still pass (you add new ones in Step 5).

### Step 4: Add unit tests for the guard in `store.test.js`

In `packages/core/src/store.test.js`, add a new `describe` block (model it on
the existing `parseLocalPath` block at lines 35-56; `fs` and `path` are already
imported at the top of the file):

```js
describe('isSafeRelName / ochrona przed path traversal (zapis)', () => {
  it('przepuszcza zwykłe zagnieżdżone nazwy', () => {
    expect(store.isSafeRelName('snippets/foo.liquid')).toBe(true);
    expect(store.isSafeRelName('a/b/c.liquid')).toBe(true);
  });

  it('odrzuca segmenty ../. , separatory Windows i puste/NUL', () => {
    expect(store.isSafeRelName('../evil')).toBe(false);
    expect(store.isSafeRelName('a/../../b')).toBe(false);
    expect(store.isSafeRelName('..')).toBe(false);
    expect(store.isSafeRelName('a\\b')).toBe(false);
    expect(store.isSafeRelName('')).toBe(false);
    expect(store.isSafeRelName('a\0b')).toBe(false);
  });

  it('writeLocalFile rzuca i NIE pisze pliku poza katalogiem szablonu', () => {
    const escaped = path.join(store.templateModeDir(shop, 5, 0), '..', '..', 'escape.txt');
    expect(() => store.writeLocalFile(shop, 5, 0, '../../escape.txt', Buffer.from('x'))).toThrow();
    expect(fs.existsSync(escaped)).toBe(false);
  });
});
```

**Verify**: `npx vitest run packages/core/src/store.test.js` → all pass,
including the 3 new tests.

### Step 5: Add an integration test for the download sink in `syncEngine.watcher.test.js`

At the top of `packages/core/src/syncEngine.watcher.test.js`, add the `path`
import next to the existing `fs` import (line 2):

```js
import path from 'node:path';
```

Then add this test inside the existing
`describe('_initialDownload — pierwsze pobranie', …)` block (after the existing
`it`, around line 125):

```js
  it('odrzuca plik o niebezpiecznej nazwie (path traversal) — nie pisze poza katalog', async () => {
    client.files = [
      { Mode: 0, Name: '../../escape.liquid', Template: Buffer.from('EVIL'), Date: '2026-01-01T00:00:00' },
      { Mode: 0, Name: 'ok.liquid', Template: Buffer.from('OK'), Date: '2026-01-01T00:00:00' },
    ];
    await session._initialDownload();

    // bezpieczny plik zapisany
    expect(fs.existsSync(store.localFilePath(shop.Name, template.Id, 0, 'ok.liquid'))).toBe(true);
    // złośliwy plik NIE trafił poza katalog
    const escaped = path.join(store.templateModeDir(shop.Name, template.Id, 0), '..', '..', 'escape.liquid');
    expect(fs.existsSync(escaped)).toBe(false);
    // brak meta dla złośliwego wpisu
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, '../../escape.liquid')).toBeNull();
  });
```

**Verify**: `npx vitest run packages/core/src/syncEngine.watcher.test.js` → all
pass, including the new test.

### Step 6: Full suite + commit

**Verify**: `npm test` → exit 0, all test files pass. Then commit on the branch
per the Git workflow section.

## Test plan

- `store.test.js`: `isSafeRelName` happy path (nested names) + rejection
  (`..`, `.`, embedded `../`, Windows `\`, empty, NUL); `writeLocalFile` throws
  and writes nothing outside the template dir.
- `syncEngine.watcher.test.js`: `_initialDownload` with one malicious and one
  safe entry — safe file written, malicious file absent from the escaped
  location, no meta row for the malicious name.
- `translations.test.js` (existing, unchanged) verifies PL/EN key parity and
  `{name}` token parity for the new key automatically.
- Verification: `npm test` → all pass, including the new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0; new tests in `store.test.js` and
  `syncEngine.watcher.test.js` exist and pass.
- [ ] `grep -n "isSafeRelName" packages/core/src/store.js packages/core/src/syncEngine.js` shows the predicate defined in store and used in both download sinks.
- [ ] `node -e "import('@liquidflow/core').then(m=>{const p=m.translationsFor('pl'),e=m.translationsFor('en');process.exit(p.UnsafeRemotePath&&e.UnsafeRemotePath?0:1)})"` exits 0.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase drifted since this plan was written) — in particular if
  `_initialDownload`'s progress loop has been restructured.
- A step's verification fails twice after a reasonable fix attempt.
- Adding the guard breaks an existing test that relied on writing a `.`-prefixed
  or traversal-style name (it should not — `isSafeRelName` allows normal names).
  If so, the existing behavior may be load-bearing in a way this plan missed:
  stop and report.
- You find another write/delete sink that takes a server-supplied name and is
  not covered by `isSafeRelName` (out-of-scope expansion).

## Maintenance notes

- If a new code path is added that writes local files from server data, it must
  call `store.isSafeRelName(name)` first (or rely on `writeLocalFile`'s throw).
  The `writeLocalFile` backstop is the safety net; the syncEngine guards exist
  so one bad file doesn't abort a whole download and the user sees a clear log.
- Reviewer should confirm the guard rejects Windows separators (`\`) — on
  Windows `path.join` treats `\` as a separator, so a name like `..\..\evil`
  would traverse without the `\` check.
- Deliberately not changed: `parseLocalPath` (read side) and the
  `insecureTLS`/`http://localhost` allowances (separate, opt-in concerns). This
  plan closes the filesystem-write boundary regardless of transport trust.
