# Plan 030: Share shop configuration between machines — in-app export/import of shops (CLI + desktop)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> This is one feature split into five phases (A core crypto → B controller →
> C RPC wiring → D CLI UI → E desktop UI), plus i18n/version/tests. Each phase
> ends green on its own; commit per phase.
>
> **Drift check (run first)**:
> `git diff --stat b49b1d6..HEAD -- packages/core/src/store.js packages/core/src/controller.js packages/core/src/daemon/protocol.js packages/core/src/daemon/client.js apps/desktop/electron/main.js apps/desktop/electron/preload.cjs apps/cli/src/commands.js apps/cli/src/components/ConnectList.jsx packages/core/src/translations.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (touches credential handling; a crafted import file is untrusted input)
- **Depends on**: none (builds on the shared-daemon architecture from plans 022–029, already DONE)
- **Category**: direction (feature)
- **Planned at**: commit `b49b1d6`, 2026-07-04

## Why this matters

A user with ~15 configured shops has no way to hand that configuration to a
teammate without manually re-adding every shop (name, URL, password) by hand.
They explicitly want this **inside the app** (native save/open, not "drop a file
in a folder"), with a **selection step** (all shops checked by default, uncheck
to share a subset), on **both CLI and desktop** — and **not** MCP (the MCP server
must never touch passwords).

The load-bearing constraint: shop passwords in `config.json` are encrypted with a
**machine-local random key** (`packages/core/src/store.js:46-53`, the `.key`
file). A raw copy of the `enc:…` string is useless on another machine. So the
export must decrypt locally and re-protect the bundle under a **user-chosen
passphrase** (optional — blank passphrase = export without passwords), and the
import must re-encrypt each password under the importer's own local key.

Decided behavior (from the requesting maintainer):

- **Passphrase optional.** If set → the whole bundle is encrypted (PBKDF2 +
  AES-256-GCM) and the teammate types the same passphrase to import. If blank →
  the bundle carries **no passwords** (teammate re-enters them). **Plaintext
  credentials are never written to disk in either case.**
- **Share connection + template unlock passwords.** Per shop: `Name`, `Url`,
  `Login`, shop password, and the unlock passwords of locked templates. **Never**
  local files, `meta/`, `.git`, or logs.
- **Name collisions warn, user decides per shop.** On import, a shop whose name
  already exists is flagged; the user chooses **Skip / Update (overwrite config)
  / Rename (import under a new unique name)** for each. Non-colliding shops are a
  simple checkbox, checked by default.

## Current state

### How a shop is stored (the shape you export/import)

`packages/core/src/controller.js:148-156` (inside `signInShop`) is the canonical
shop record shape — an entry in `config.Shops`:

```js
shop = { Id: id, Name: name, Login: 'webmaster', Templates: [] };
// then:
shop.Url = url;
shop.SavePassword = !!SavePassword;
shop.Password = SavePassword ? store.encrypt(Password || '') : '';   // 'enc:iv:data'
```

Locked-template records live in `shop.Templates[]`; each is written in
`unlockTemplate` (`controller.js:270-274`) as
`{ Id, Name, SavePassword, Password: store.encrypt(...) }` (plus other fields).
Shop **names are validated** to `^[A-Za-z0-9]+$` on creation
(`controller.js:135`) and names are used directly as **on-disk directory names**
(`store.js:95-97` `shopDir`), so any imported name MUST be re-validated to the
same pattern (an unchecked `../…` name would escape the data dir).

### Password crypto (local key) — you will reuse these

`packages/core/src/store.js:55-73`:

```js
export function encrypt(plain) { /* 'enc:' + iv + ':' + aes-256-cbc(localKey) */ }
export function decrypt(stored) { /* '' if not 'enc:'-prefixed or on failure */ }
```

`store` is re-exported as a namespace from `@liquidflow/core` (`index.js:` `export * as store …`).

### Controller shop methods (where new methods go)

`controller.js:127-236` holds `// ---------- sklepy ----------`: `listShops`,
`getCurrentShop`, `signInShop`, `signInSaved`, `logout`, `removeShop`. Controller
top-of-file imports (`controller.js:6-13`) include
`import * as store from './store.js';` and `import * as logbuf from './log.js';`.
Add the new share methods at the end of that shops section. The controller has a
getter `get t()` (`controller.js:56`) for translations and calls
`logbuf.logOk(logbuf.tmsg('Key', params))` for i18n-aware log entries.

### RPC surface — FOUR wiring points (this repo has a shared daemon)

Both CLI and desktop talk to one daemon that owns the `Controller`. A new
controller method must be exposed in all of these:

1. `packages/core/src/daemon/protocol.js:20-25` — daemon method map (used by CLI):
   ```js
   'shops.list': () => ctrl.listShops(),
   'shops.remove': (id) => ctrl.removeShop(id),
   ```
2. `packages/core/src/daemon/client.js:154-159` — `DaemonClient` (CLI's handle):
   ```js
   listShops() { return this.call('shops.list'); }
   removeShop(id) { return this.call('shops.remove', id); }
   ```
3. `apps/desktop/electron/main.js:102-107` — Electron IPC handler map (`ctrl` here
   is **also a `DaemonClient`** — desktop connects to the same daemon, see
   `main.js:29`). This is where **file dialogs** live (Electron-only).
4. `apps/desktop/electron/preload.cjs:13-18` — `window.api` bridge for the renderer.

MCP (`apps/mcp/`) is **out of scope** and must remain unchanged.

### CLI shop-management screen (where CLI export/import is triggered)

`apps/cli/src/commands.js:107-129` builds the `/connect` screen (a dedicated
`ConnectList`, not a `Picker`). Its footer `actions` array is where you add
`export` / `import`:

```js
const actions = [];
if (hasShop) actions.push({ key: 'logout', label: t.DisconnectSession });
actions.push({ key: 'add', label: t.AddConnectionShort });
if (shops.length) actions.push({ key: 'remove', label: t.RemoveShopTitle });
openConnect({ title: t.ConnectToShop, shops: shopItems, actions,
  onShop: connectToShop,
  onAction: (key) => {
    if (key === 'add') { loginForm(); return; }
    if (key === 'logout') { backToInput(); ctrl.logout(); return; }
    if (key === 'remove') { removeShopPicker(); return; }
  }, onSlash: skipToInput });
```

`ctx` helpers available in `commands.js` (destructured at `commands.js:19`):
`openForm(title, fields, onSubmit)`, `openPicker`, `withLoading(label, fn, title?)`,
`ctrl`, `refreshShops`, `log` (= the `logbuf` namespace for `log.tmsg`),
`backToInput`, `skipToInput`. Forms support masked fields:
`{ name, label, mask: '*' }` and initial values `{ name, label, initial }`
(see `commands.js:48-52` and `commands.js:424`).

The CLI process is local (not the daemon) so it may read/write files directly
with `node:fs`. Import `fs` at the top of the file that does the I/O.

### CLI list component to model the new checkbox screen on

`apps/cli/src/components/ConnectList.jsx` is the structural pattern for a
keyboard-driven Ink list (windowed via `windowList` from `../window.js`, cyan
round border, `useInput`, `dimColor` help footer, adapts to dark/light terminal —
**no `color="white"`, secondary text uses `dimColor` without `color="gray"`**;
see the color rules in `CLAUDE.md`). Reuse its layout idioms for the new
`CheckList` component. Selected row styling in this repo:
`color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined}`.

### Desktop form + list patterns to model on

`apps/desktop/renderer/src/components/ShopForm.jsx` is the full-panel form
pattern (shadcn `Card`/`Button`/`Input`/`Label`/`Switch`, `useApp()` context,
`call(() => api.x(), …)` with auto error-toast, `navigate('welcome')`).
`apps/desktop/renderer/src/components/Sidebar.jsx:65-69` is the footer where the
Export/Import entry buttons go. Routing is a `switch` in
`apps/desktop/renderer/src/App.jsx:117-127` (`MainContent`) keyed on
`route.view`; navigation via `navigate('viewName', extraProps)`.

**Available desktop UI primitives** (`apps/desktop/renderer/src/components/ui/`):
`badge, button, card, dialog, input, label, select, sonner, switch, tabs`.
**There is no `checkbox` primitive** — use a native `<input type="checkbox">`
(Tailwind-styled) for the selection lists. Do **not** add a new ui primitive
(keep desktop changes additive — it is a draft UI).

### i18n rule (hard)

`packages/core/src/translations.js` holds two **flat** string tables `pl` and
`en` (`en = { ...pl, …overrides }`). **Every** new user-visible string needs a
key in **both**. Dynamic parts use `{token}` and are composed by `tfmt`. The
parity test `packages/core/src/translations.test.js` fails if a key is missing
from either table or if `en[k] === pl[k]` while `pl[k]` contains Polish
diacritics. Add English overrides for keys whose PL text has diacritics.

### Version + changelog + test gate (per CLAUDE.md, mandatory)

- Bump the patch version in **all four** `package.json` (root, `apps/cli`,
  `packages/core`, `apps/mcp`) — currently **`0.9.147`** → **`0.9.148`**.
- Add a `CHANGELOG.md` entry under a new `## [0.9.148] — 2026-07-04` heading.
- `npm test` must be 100% green before any commit.

## Commands you will need

| Purpose            | Command                                                    | Expected on success |
|--------------------|-----------------------------------------------------------|---------------------|
| Install (once)     | `npm install`                                             | exit 0              |
| Unit/int/component | `npm test`                                                | all pass (Vitest)   |
| One test file      | `npx vitest run packages/core/src/shareConfig.test.js`   | pass                |
| i18n parity        | `npx vitest run packages/core/src/translations.test.js`  | pass                |
| CLI render smoke   | `node apps/cli/test/connectlist-render.mjs`              | renders, no throw   |

There is no typecheck/lint script — `npm test` is the gate. `npm run test:e2e`
is a separate, slower suite; only run it if you touched `bin/liquidflow.js` or
CLI boot (this plan does not).

## Scope

**In scope** (create or modify only these):

Core:
- `packages/core/src/shareConfig.js` (create) — crypto + envelope build/read
- `packages/core/src/shareConfig.test.js` (create)
- `packages/core/src/controller.js` (modify — add export/preview/import methods)
- `packages/core/src/controller.share.test.js` (create)
- `packages/core/index.js` (modify — export the new module)
- `packages/core/src/daemon/protocol.js` (modify — 3 methods)
- `packages/core/src/daemon/client.js` (modify — 3 methods)
- `packages/core/src/translations.js` (modify — new keys, PL + EN)

CLI:
- `apps/cli/src/components/CheckList.jsx` (create)
- `apps/cli/src/components/CheckList.test.jsx` (create)
- `apps/cli/src/commands.js` (modify — footer actions + export/import flows)

Desktop:
- `apps/desktop/electron/main.js` (modify — 3 crypto handlers + 2 file-dialog handlers)
- `apps/desktop/electron/preload.cjs` (modify — bridge methods)
- `apps/desktop/renderer/src/components/ShopExport.jsx` (create)
- `apps/desktop/renderer/src/components/ShopImport.jsx` (create)
- `apps/desktop/renderer/src/components/Sidebar.jsx` (modify — entry buttons)
- `apps/desktop/renderer/src/App.jsx` (modify — 2 routes)

Bookkeeping:
- `package.json`, `apps/cli/package.json`, `packages/core/package.json`,
  `apps/mcp/package.json` (version bump)
- `CHANGELOG.md`

**Out of scope** (do NOT touch):

- `apps/mcp/**` — the MCP server must never get password access. No new MCP tool,
  no wiring. (The requirement is explicit.)
- `packages/core/src/store.js` `encrypt`/`decrypt` — reuse as-is; do not change
  the on-disk format or the local-key scheme.
- The SOAP layer (`soap.js`) and sync engine — sharing is pure config, no network.
- Local files / `meta/` / `.git` / logs — export config only, never file contents.

## Git workflow

- Work directly on `main` (repo convention, see CLAUDE.md).
- Conventional Commits in English, **no `Co-Authored-By` footer**. One commit per
  phase is fine, e.g. `feat(core): shop config export/import crypto + controller`,
  `feat(cli): export/import shops screen`, `feat(desktop): export/import shops UI`.
- Bump the version + changelog **once** with the final commit of the feature (or
  per commit if you split — but never commit without a bump). Run `npm test`
  green before each commit.
- Do not push unless the operator asks (CLAUDE.md says push after each task; the
  dispatching reviewer will tell you whether to push).

---

## Steps

### Phase A — Core crypto module

#### Step A1: Create `packages/core/src/shareConfig.js`

Pure, dependency-free (Node `crypto` only). No local-key access here — the caller
passes `decryptFn`/`encryptFn`. Produce exactly this API:

```js
// Nagłówek: Przenośny pakiet konfiguracji sklepów (export/import między maszynami).
// Hasła w config.json są szyfrowane KLUCZEM LOKALNYM maszyny, więc surowa kopia
// jest bezużyteczna gdzie indziej. Tutaj: (1) budujemy rekordy z ODSZYFROWANYMI
// hasłami (caller podaje decryptFn), (2) szyfrujemy CAŁY pakiet hasłem
// użytkownika (PBKDF2 + AES-256-GCM). Pusta fraza → pakiet BEZ haseł.
import crypto from 'node:crypto';

export const BUNDLE_APP = 'LiquidFlow';
export const BUNDLE_KIND = 'shops-export';
export const BUNDLE_VERSION = 1;
const KDF_ITERS = 210000;

export class ShareError extends Error {
  constructor(code) { super(code); this.name = 'ShareError'; this.code = code; }
}

// Zbuduj rekordy do udostępnienia z PEŁNYCH rekordów config.Shops.
// includeSecrets=false → hasła pominięte (SavePassword=false), do pakietu bez frazy.
export function buildShopRecords(shops, decryptFn, includeSecrets) {
  return (shops || []).map((s) => {
    const rec = {
      Name: s.Name,
      Url: s.Url,
      Login: s.Login || 'webmaster',
      SavePassword: includeSecrets ? !!s.SavePassword : false,
      Password: (includeSecrets && s.SavePassword && s.Password) ? decryptFn(s.Password) : '',
      Templates: [],
    };
    if (Array.isArray(s.Templates)) {
      rec.Templates = s.Templates.map((tpl) => ({
        Id: tpl.Id,
        Name: tpl.Name,
        SavePassword: includeSecrets ? !!tpl.SavePassword : false,
        Password: (includeSecrets && tpl.SavePassword && tpl.Password) ? decryptFn(tpl.Password) : '',
      }));
    }
    return rec;
  });
}

// Zapakuj rekordy w przenośną kopertę. Pusta fraza → koperta jawna (rekordy
// muszą już być bez sekretów). Niepusta → PBKDF2 + AES-256-GCM.
export function buildEnvelope(records, passphrase) {
  const pass = passphrase == null ? '' : String(passphrase);
  const base = {
    app: BUNDLE_APP, kind: BUNDLE_KIND, version: BUNDLE_VERSION,
    createdAt: new Date().toISOString(),
  };
  if (!pass) return { ...base, encrypted: false, shops: records };

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(pass, salt, KDF_ITERS, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(records), 'utf8')), c.final()]);
  return {
    ...base, encrypted: true, cipher: 'aes-256-gcm', kdf: 'pbkdf2-sha256',
    iterations: KDF_ITERS,
    salt: salt.toString('base64'), iv: iv.toString('base64'),
    authTag: c.getAuthTag().toString('base64'), data: enc.toString('base64'),
  };
}

// Odczytaj kopertę → rekordy. Rzuca ShareError('BadFormat'|'PassphraseRequired'|'BadPassphrase').
export function readEnvelope(envelope, passphrase) {
  if (!envelope || envelope.app !== BUNDLE_APP || envelope.kind !== BUNDLE_KIND) {
    throw new ShareError('BadFormat');
  }
  if (!envelope.encrypted) {
    if (!Array.isArray(envelope.shops)) throw new ShareError('BadFormat');
    return envelope.shops;
  }
  const pass = passphrase == null ? '' : String(passphrase);
  if (!pass) throw new ShareError('PassphraseRequired');
  try {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.authTag, 'base64');
    const data = Buffer.from(envelope.data, 'base64');
    const key = crypto.pbkdf2Sync(pass, salt, envelope.iterations || KDF_ITERS, 32, 'sha256');
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    const pt = Buffer.concat([d.update(data), d.final()]);
    return JSON.parse(pt.toString('utf8'));
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError('BadPassphrase'); // zła fraza → GCM auth fail
  }
}
```

**Verify** (after A2): `npx vitest run packages/core/src/shareConfig.test.js` → pass.

#### Step A2: Create `packages/core/src/shareConfig.test.js`

Model structure on `packages/core/src/store.test.js` (Vitest, `describe/it/expect`).
Cover:

- roundtrip with passphrase: `buildShopRecords` (with a fake `decrypt` that maps
  `'enc:X'`→`'X'`) → `buildEnvelope(records, 'secret')` → `readEnvelope(env, 'secret')`
  returns the original records (passwords present).
- wrong passphrase: `readEnvelope(env, 'nope')` throws `ShareError` with
  `code === 'BadPassphrase'`.
- encrypted bundle, missing passphrase: `readEnvelope(env, '')` throws code
  `'PassphraseRequired'`.
- no passphrase → `buildShopRecords(shops, dec, false)` yields `Password === ''`
  and `SavePassword === false`; `buildEnvelope(records, '')` has
  `encrypted === false`; `readEnvelope` returns them without needing a passphrase.
- `BadFormat`: `readEnvelope({ app: 'x' }, '')` throws code `'BadFormat'`.
- the encrypted envelope's serialized JSON does **not** contain a known plaintext
  password substring (assert `JSON.stringify(env)` has no `'topsecret'`).

**Verify**: `npx vitest run packages/core/src/shareConfig.test.js` → all pass.

#### Step A3: Export the module from the core barrel

In `packages/core/index.js`, add:
```js
export * as shareConfig from './src/shareConfig.js';
```
(Placed near the other `export * as store` lines.)

**Verify**: `node -e "import('@liquidflow/core').then(m=>{if(!m.shareConfig)throw new Error('missing');console.log('ok')})"` → prints `ok`.

---

### Phase B — Controller methods

#### Step B1: Add import and three methods to `controller.js`

At the top imports (`controller.js:6-13`), add:
```js
import { buildShopRecords, buildEnvelope, readEnvelope } from './shareConfig.js';
```

At the end of the `// ---------- sklepy ----------` section (right before
`// ---------- szablony ----------` near `controller.js:236`), add the methods
below. Note the **name re-validation** (`^[A-Za-z0-9]+$`) — imported names are
untrusted and become directory names.

```js
  // ---------- udostępnianie konfiguracji (export / import sklepów) ----------
  // Buduje przenośny pakiet z WYBRANYCH sklepów. `ids` puste/brak = wszystkie.
  // Pusta `passphrase` → pakiet bez haseł (kolega wpisze je ręcznie). Zwraca
  // { json, count, encrypted } — warstwa aplikacji zapisuje `json` do pliku.
  exportShops({ ids, passphrase } = {}) {
    const idSet = Array.isArray(ids) && ids.length ? new Set(ids.map(Number)) : null;
    const shops = this.config.Shops.filter((s) => !idSet || idSet.has(s.Id));
    const includeSecrets = !!(passphrase && String(passphrase).length);
    const records = buildShopRecords(shops, store.decrypt, includeSecrets);
    const envelope = buildEnvelope(records, passphrase);
    logbuf.logOk(logbuf.tmsg('ShopsExported', { count: records.length }));
    return { json: JSON.stringify(envelope, null, 2), count: records.length, encrypted: !!envelope.encrypted };
  }

  // Podgląd pakietu — NIE zwraca haseł do UI. Lista sklepów + flagi
  // exists/hasPassword + `encrypted`. Rzuca przetłumaczony błąd (zła fraza itd.).
  importPreview({ json, passphrase } = {}) {
    const envelope = this._parseShareJson(json);
    let records;
    try { records = readEnvelope(envelope, passphrase); }
    catch (e) { throw this._shareErr(e); }
    const existing = new Set(this.config.Shops.map((s) => s.Name));
    const shops = records
      .filter((r) => this._validShopName(r.Name))
      .map((r) => ({
        Name: r.Name, Url: r.Url,
        hasPassword: !!(r.SavePassword && r.Password),
        exists: existing.has(r.Name),
      }));
    return { encrypted: !!envelope.encrypted, shops };
  }

  // Import wybranych sklepów. `selections` = [{ Name, action, saveAs? }],
  //   action: 'add' | 'update' | 'skip'. Brak `selections` → dodaj wszystkie.
  // Zwraca { added, updated, skipped }.
  importShops({ json, passphrase, selections } = {}) {
    const envelope = this._parseShareJson(json);
    let records;
    try { records = readEnvelope(envelope, passphrase); }
    catch (e) { throw this._shareErr(e); }
    const byName = new Map(records.map((r) => [r.Name, r]));
    const sel = Array.isArray(selections) ? selections : records.map((r) => ({ Name: r.Name, action: 'add' }));
    let added = 0, updated = 0, skipped = 0;
    for (const d of sel) {
      const rec = byName.get(d && d.Name);
      if (!rec || !this._validShopName(rec.Name) || (d && d.action === 'skip')) { skipped++; continue; }
      if (d.action === 'update') {
        const existing = this.config.Shops.find((s) => s.Name === rec.Name);
        if (existing) { this._applyImportedShop(existing, rec); updated++; }
        else { this._addImportedShop(rec, rec.Name); added++; }
      } else { // 'add' (i „rename": add zawsze unika kolizji przez sufiks)
        this._addImportedShop(rec, this._uniqueShopName(d.saveAs || rec.Name)); added++;
      }
    }
    store.saveConfig(this.config);
    logbuf.logOk(logbuf.tmsg('ShopsImported', { added, updated, skipped }));
    this.emitState();
    return { added, updated, skipped };
  }

  // --- helpery importu/exportu ---
  _validShopName(name) { return typeof name === 'string' && /^[A-Za-z0-9]+$/.test(name); }
  _parseShareJson(json) {
    try { return JSON.parse(json); } catch { throw new Error(this.t.ShareBadFile); }
  }
  _shareErr(e) {
    const t = this.t;
    if (e && e.code === 'PassphraseRequired') return new Error(t.SharePassphraseRequired);
    if (e && e.code === 'BadPassphrase') return new Error(t.ShareBadPassphrase);
    if (e && e.code === 'BadFormat') return new Error(t.ShareBadFile);
    return e;
  }
  _nextShopId() {
    return this.config.Shops.length ? Math.max(...this.config.Shops.map((s) => s.Id)) + 1 : 1;
  }
  _uniqueShopName(name) {
    const names = new Set(this.config.Shops.map((s) => s.Name));
    if (!names.has(name)) return name;
    let i = 2, cand; // sufiks cyfrowy — nazwa dalej pasuje do ^[A-Za-z0-9]+$
    do { cand = `${name}${i++}`; } while (names.has(cand));
    return cand;
  }
  // Nadpisz pola połączenia istniejącego sklepu z rekordu (re-szyfrowanie
  // KLUCZEM LOKALNYM tej maszyny). Nie rusza Id ani plików na dysku.
  _applyImportedShop(shop, rec) {
    shop.Url = rec.Url;
    shop.Login = rec.Login || 'webmaster';
    shop.SavePassword = !!(rec.SavePassword && rec.Password);
    shop.Password = shop.SavePassword ? store.encrypt(rec.Password) : '';
    shop.Templates = Array.isArray(rec.Templates) ? rec.Templates.map((tpl) => ({
      Id: tpl.Id, Name: tpl.Name,
      SavePassword: !!(tpl.SavePassword && tpl.Password),
      Password: (tpl.SavePassword && tpl.Password) ? store.encrypt(tpl.Password) : '',
    })) : [];
  }
  _addImportedShop(rec, name) {
    const shop = { Id: this._nextShopId(), Name: name, Login: rec.Login || 'webmaster', Templates: [] };
    this._applyImportedShop(shop, rec);
    this.config.Shops.push(shop);
  }
```

**Verify** (after B2): `npx vitest run packages/core/src/controller.share.test.js` → pass.

#### Step B2: Create `packages/core/src/controller.share.test.js`

Model on `packages/core/src/controller.test.js` (build a `Controller` per test,
`dispose()` in `afterEach`, reset the log channel `logbuf.setActiveChannel('app')`,
isolate config with `store.paths.CONFIG_PATH` cleared in `beforeEach` — see the
isolation notes in that file's header). **No SOAP needed** — export/import are
pure config. Seed shops by writing `config.json` directly (or by pushing to
`controller.config.Shops` then `store.saveConfig`), including at least one shop
with `SavePassword:true, Password: store.encrypt('topsecret')` and one locked
template with an encrypted password.

Cover:

- `exportShops({ passphrase: 'p' })` → returned `json` parses to an envelope with
  `encrypted:true`, and `JSON.stringify` of it contains neither `'topsecret'` nor
  the template password plaintext.
- `exportShops({ ids: [firstId], passphrase: 'p' })` → `count === 1`.
- `exportShops({ passphrase: '' })` → `encrypted === false`; round-tripping via
  `importPreview` shows `hasPassword === false` for all.
- `importPreview({ json, passphrase: 'p' })` on a fresh controller (no shops) →
  `shops[i].exists === false`; on a controller that already has a shop named the
  same → `exists === true`.
- `importPreview` with encrypted json and wrong passphrase → throws (message is
  the translated `ShareBadPassphrase`); with empty passphrase → throws
  `SharePassphraseRequired`.
- `importShops({ json, passphrase, selections: [{Name, action:'add'}] })` into an
  empty controller → shop appears in `config.Shops` with a **re-encrypted**
  password (`config.Shops[0].Password` starts with `'enc:'` and
  `store.decrypt(it) === 'topsecret'`).
- collision `action:'update'` overwrites the existing shop's Url; `action:'skip'`
  leaves it unchanged; `action:'add'` on a colliding name creates a second shop
  with a suffixed unique name (e.g. `Shop2`), original untouched.
- crafted bad name: build an envelope whose record `Name` is `'../evil'`, run
  `importShops` → that record is skipped (no shop with that name created;
  `skipped >= 1`).

**Verify**: `npx vitest run packages/core/src/controller.share.test.js` → all pass.

---

### Phase C — RPC wiring (CLI daemon path)

#### Step C1: `packages/core/src/daemon/protocol.js`

After the `'shops.remove'` line (`:25`), add:
```js
    'shops.export': (d) => ctrl.exportShops(d),
    'shops.importPreview': (d) => ctrl.importPreview(d),
    'shops.import': (d) => ctrl.importShops(d),
```

#### Step C2: `packages/core/src/daemon/client.js`

After the `removeShop` method (`:159`), add:
```js
  exportShops(d) { return this.call('shops.export', d); }
  importPreview(d) { return this.call('shops.importPreview', d); }
  importShops(d) { return this.call('shops.import', d); }
```

**Verify**: `npm test` → still green (no test regressions; daemon tests exercise
the method map). Also `node -e "import('@liquidflow/core').then(m=>{const c=new m.DaemonClient();['exportShops','importPreview','importShops'].forEach(k=>{if(typeof c[k]!=='function')throw new Error(k)});console.log('ok')})"` → `ok`.

---

### Phase D — CLI UI

#### Step D1: Create `apps/cli/src/components/CheckList.jsx`

A keyboard-driven selection list. Two row kinds:

- **normal** row: a checkbox `[x] / [ ]`, checked by default.
- **conflict** row (`item.conflict === true`): no checkbox — instead a 3-state
  action cycled with ←/→: **Skip / Update / Rename** (default **Skip**, the
  non-destructive choice).

Props: `{ title, items, onConfirm, onCancel, t, maxRows = 12 }` where each item is
`{ key, label, hint?, conflict?: boolean }`. Internal state: a `checked` map
(normal rows, default true) and an `action` map (conflict rows, default
`'skip'`). Keys via `useInput`:

- `↑/↓` move focus (window the list with `windowList` from `../window.js`).
- `space` toggle `checked` for a normal row (no-op on conflict rows).
- `←/→` cycle action for a conflict row through `['skip','update','rename']`
  (no-op on normal rows).
- `a` toggle-all normal rows on/off (leave conflict rows).
- `Enter` → `onConfirm(selections)` where `selections` is:
  - normal + checked → `{ Name: item.key, action: 'add' }`
  - normal + unchecked → omitted
  - conflict → `{ Name: item.key, action: item.action === 'update' ? 'update' : item.action === 'rename' ? 'add' : 'skip' }`
    (Rename maps to `'add'` — the controller auto-suffixes a unique name.)
- `Esc` → `onCancel()`.

Render rules (match `ConnectList.jsx` and `CLAUDE.md` color rules): cyan round
border; focused row `color="black" backgroundColor="cyan"`; unfocused rows use
**default** foreground (never `color="white"`); hints and the help footer use
`dimColor` **without** `color="gray"`; conflict action label uses an accent
(e.g. `yellow` for the warning marker). Show a `dimColor` help line, e.g.
`t.CheckListNav` composed like `ConnectList`'s help. Use `tfmt(t.MoreAbove/Below, …)`
for window indicators.

Keep the label building for conflict rows i18n-driven:
`t.ShareActionSkip / t.ShareActionUpdate / t.ShareActionRename` and a
`t.ShareExistsBadge` (e.g. "już istnieje").

#### Step D2: Create `apps/cli/src/components/CheckList.test.jsx`

Model on `apps/cli/src/components/ConnectList.test.jsx`, using the
`test/helpers/ink.js` helpers (`press`, `keys`, `frame`). Cover: default all
checked; `space` unchecks the focused row; `a` toggles all; on a conflict row
`→` advances the action label through Skip→Update→Rename; `Enter` calls
`onConfirm` with the expected selections array (assert the payload for a mix of a
checked normal row, an unchecked normal row, and a conflict row set to Update);
`Esc` calls `onCancel`.

**Verify**: `npx vitest run apps/cli/src/components/CheckList.test.jsx` → pass.

#### Step D3: Wire export/import into `apps/cli/src/commands.js`

1. Add `import fs from 'node:fs';` at the top of the file if not present.
2. Add `import CheckList from './components/CheckList.jsx';` — **but** overlay
   screens in this app are opened through `ctx` helpers, not by importing
   components into `commands.js`. Check how `openConnect`/`openConflicts` are
   provided by `App.jsx` and add a parallel `openCheckList(props)` helper there
   if overlays must be registered in `App.jsx`'s mode model. **If** `App.jsx`
   routes overlays by a `mode.type` switch (it does — see `CLAUDE.md` "Model
   trybów w App.jsx"), you must: (a) add a `checklist` branch to that switch that
   renders `<CheckList …/>` wrapped by `wrapAction(...)`, and (b) expose an
   `openCheckList` helper in `ctx` mirroring `openConnect`. Follow the exact
   pattern `openConnect` uses (`grep -n "openConnect" apps/cli/src/App.jsx`).
   **STOP and report** if you cannot find `openConnect` in `App.jsx` — the
   overlay-registration pattern has drifted and improvising will corrupt the
   nav model.
3. In `connect()` (`commands.js:107-129`), add footer actions:
   ```js
   if (shops.length) actions.push({ key: 'export', label: t.ShareExport });
   actions.push({ key: 'import', label: t.ShareImport });
   ```
   and handle them in `onAction`:
   ```js
   if (key === 'export') { exportFlow(); return; }
   if (key === 'import') { importFlow(); return; }
   ```
4. Implement the two flows near `connect`:

   ```js
   // Export: wybór sklepów (CheckList, wszystkie zaznaczone) → fraza + ścieżka
   // → zapis pliku. `withLoading` na czas budowy pakietu.
   const exportFlow = () => {
     openCheckList({
       title: t.ShareExportTitle,
       items: shops.map((s) => ({ key: String(s.Id), label: s.Name, hint: s.Url })),
       onConfirm: (sel) => {
         const ids = sel.filter((d) => d.action === 'add').map((d) => Number(d.Name));
         if (!ids.length) { log.logInfo(log.tmsg('ShareNothingSelected')); return; }
         openForm(t.ShareExportTitle, [
           { name: 'Passphrase', label: t.SharePassphraseOptional, mask: '*' },
           { name: 'Path', label: t.ShareFilePath, initial: 'liquidflow-shops.lfshops' },
         ], (vals) => withLoading(t.ShareExporting, async () => {
           const res = await ctrl.exportShops({ ids, passphrase: vals.Passphrase });
           fs.writeFileSync(vals.Path, res.json);
           log.logOk(log.tmsg('ShareExportedTo', { count: res.count, path: vals.Path }));
         }));
       },
     });
   };

   // Import: ścieżka + fraza → preview → CheckList (kolizje jako akcje) → import.
   const importFlow = () => {
     openForm(t.ShareImportTitle, [
       { name: 'Path', label: t.ShareFilePath },
       { name: 'Passphrase', label: t.SharePassphraseOptional, mask: '*' },
     ], (vals) => withLoading(t.ShareImporting, async () => {
       let json;
       try { json = fs.readFileSync(vals.Path, 'utf8'); }
       catch { log.logErr(log.tmsg('ShareFileReadFailed', { path: vals.Path })); return; }
       let preview;
       try { preview = await ctrl.importPreview({ json, passphrase: vals.Passphrase }); }
       catch (e) { log.logErr(e.message); return; } // przetłumaczony błąd z kontrolera
       openCheckList({
         title: t.ShareImportTitle,
         items: preview.shops.map((s) => ({
           key: s.Name, label: s.Name, hint: s.Url, conflict: s.exists,
         })),
         onConfirm: (selections) => withLoading(t.ShareImporting, async () => {
           const res = await ctrl.importShops({ json, passphrase: vals.Passphrase, selections });
           refreshShops();
           log.logOk(log.tmsg('ShareImportedResult', res)); // {added,updated,skipped}
         }),
       });
     }));
   };
   ```

   (`log` here is the `logbuf` namespace destructured into `ctx`; confirm the
   name used in this file — `grep -n "log\." apps/cli/src/commands.js | head`.)

**Verify**:
- `npm test` → green.
- `node apps/cli/test/connectlist-render.mjs` → renders without throwing.
- Manual smoke (optional, needs a TTY):
  `script -q /dev/null node apps/cli/bin/liquidflow.js` → `/connect` shows
  Export/Import in the footer.

---

### Phase E — Desktop UI

#### Step E1: `apps/desktop/electron/main.js` — handlers (crypto via daemon + file dialogs)

1. Extend the electron import to include `dialog`:
   `import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, session, dialog } from 'electron';`
2. Add `import fs from 'node:fs/promises';` near the other imports.
3. In the `handlers` map (`main.js:97-145`), after `'shops.remove'`, add the three
   crypto delegations (they run in the daemon `ctrl`):
   ```js
   'shops.export': (d) => ctrl.exportShops(d),
   'shops.importPreview': (d) => ctrl.importPreview(d),
   'shops.import': (d) => ctrl.importShops(d),
   ```
4. Add two **desktop-only** file handlers (do NOT put these in the daemon —
   dialogs are Electron-only):
   ```js
   'sys.saveExport': async ({ json, defaultName } = {}) => {
     const r = await dialog.showSaveDialog({
       defaultPath: defaultName || 'liquidflow-shops.lfshops',
       filters: [{ name: 'LiquidFlow', extensions: ['lfshops', 'json'] }],
     });
     if (r.canceled || !r.filePath) return { canceled: true };
     await fs.writeFile(r.filePath, json, 'utf8');
     return { canceled: false, path: r.filePath };
   },
   'sys.readImport': async () => {
     const r = await dialog.showOpenDialog({
       properties: ['openFile'],
       filters: [{ name: 'LiquidFlow', extensions: ['lfshops', 'json'] }],
     });
     if (r.canceled || !r.filePaths?.[0]) return { canceled: true };
     const json = await fs.readFile(r.filePaths[0], 'utf8');
     return { canceled: false, json, path: r.filePaths[0] };
   },
   ```

#### Step E2: `apps/desktop/electron/preload.cjs` — bridge

After `removeShop` (`:18`), add:
```js
  exportShops: (d) => invoke('shops.export', d),
  importPreview: (d) => invoke('shops.importPreview', d),
  importShops: (d) => invoke('shops.import', d),
  saveExportFile: (d) => invoke('sys.saveExport', d),
  readImportFile: () => invoke('sys.readImport'),
```

#### Step E3: Create `apps/desktop/renderer/src/components/ShopExport.jsx`

Model on `ShopForm.jsx`. A full-panel `Card` with:
- A checkbox list of `shops` (from `useApp()`), all checked by default (local
  `useState` set of selected Ids). Use native `<input type="checkbox">`
  (Tailwind), one row per shop showing `Name` + `Url`.
- A passphrase `Input` (type password) with a helper `Label`/description that
  explains: blank = export without passwords (`t.SharePassphraseHint`).
- Buttons: **Export** (disabled when nothing selected) and **Cancel**.
- Export handler:
  ```js
  const res = await call(() => api.exportShops({ ids: [...selected], passphrase }));
  const saved = await call(() => api.saveExportFile({ json: res.json, defaultName: 'liquidflow-shops.lfshops' }));
  if (!saved.canceled) { toast.success(tfmt(t.ShareExportedTo, { count: res.count, path: saved.path })); navigate('welcome'); }
  ```
  (`toast` from `sonner`; `tfmt` from `@liquidflow/core`. Cancel → `navigate('welcome')`.)

#### Step E4: Create `apps/desktop/renderer/src/components/ShopImport.jsx`

Model on `ShopForm.jsx`. Flow with local state `{ json, path, encrypted, shops, passphrase, actions }`:
- **Choose file** button → `const r = await call(() => api.readImportFile()); if (!r.canceled) setJson(r.json); setPath(r.path);`
- A passphrase `Input` (shown always; required only if the preview later reports
  `encrypted`).
- **Load** button → `const p = await call(() => api.importPreview({ json, passphrase }));`
  store `p.shops` (each `{Name,Url,hasPassword,exists}`) and `p.encrypted`. If it
  throws (wrong/missing passphrase) the auto error-toast fires — leave the form so
  the user can fix the passphrase.
- Render the shop list: non-colliding rows get a native checkbox (checked by
  default). Colliding rows (`exists`) show a `Badge` "already exists"
  (`t.ShareExistsBadge`) and a shadcn `Select` (`ui/select`) with options
  Skip / Update / Rename (`t.ShareActionSkip/Update/Rename`), default **Skip**.
- **Import** button → build `selections`:
  ```js
  const selections = shops.map((s) => {
    if (s.exists) {
      const a = actions[s.Name] || 'skip';
      return { Name: s.Name, action: a === 'update' ? 'update' : a === 'rename' ? 'add' : 'skip' };
    }
    return checked.has(s.Name) ? { Name: s.Name, action: 'add' } : { Name: s.Name, action: 'skip' };
  });
  const res = await call(() => api.importShops({ json, passphrase, selections }));
  await refreshShops();
  toast.success(tfmt(t.ShareImportedResult, res));
  navigate('welcome');
  ```

#### Step E5: Sidebar entry buttons + routes

In `apps/desktop/renderer/src/components/Sidebar.jsx`, in the footer block
(`:65-69`), add two small buttons next to "Add shop" (icons `Upload` / `Download`
from `lucide-react`) → `navigate('shopExport')` (only render when `shops.length > 0`)
and `navigate('shopImport')`. Keep it additive — do not restructure the sidebar.

In `apps/desktop/renderer/src/App.jsx` `MainContent` switch (`:119-126`), add:
```js
case 'shopExport': return <ShopExport />;
case 'shopImport': return <ShopImport />;
```
and import the two components at the top of `App.jsx`.

**Verify (Phase E)**: There is no desktop test suite in `npm test`, so verify by
build sanity only:
- `npm test` → still green (you changed no tested files in a breaking way).
- `node --check apps/desktop/electron/main.js` and
  `node --check apps/desktop/electron/preload.cjs` → exit 0 (syntax).
- If the environment can run it: `npm run dev` boots, `/` sidebar shows Export &
  Import, export opens a native save dialog. If `npm run dev` cannot run in this
  environment, note that E was verified by syntax + code review only.

---

### Phase F — i18n, version, changelog

#### Step F1: Add translation keys (PL + EN) to `packages/core/src/translations.js`

Add to the `pl` table (and an English override in `en` for every key whose PL
text has diacritics — the parity test enforces this). Suggested keys/values
(adjust wording to match neighbours; keep tokens identical between PL/EN):

| Key | PL | EN |
|-----|----|----|
| `ShareExport` | `Eksportuj sklepy` | `Export shops` |
| `ShareImport` | `Importuj sklepy` | `Import shops` |
| `ShareExportTitle` | `Eksport sklepów` | `Export shops` |
| `ShareImportTitle` | `Import sklepów` | `Import shops` |
| `SharePassphraseOptional` | `Hasło pakietu (opcjonalne)` | `Bundle passphrase (optional)` |
| `SharePassphraseHint` | `Puste = eksport bez haseł (kolega wpisze je ręcznie).` | `Blank = export without passwords (your teammate re-enters them).` |
| `SharePassphraseRequired` | `Ten plik jest zaszyfrowany — podaj hasło pakietu.` | `This file is encrypted — enter the bundle passphrase.` |
| `ShareBadPassphrase` | `Nieprawidłowe hasło pakietu.` | `Wrong bundle passphrase.` |
| `ShareBadFile` | `To nie jest prawidłowy plik konfiguracji Liquid Flow.` | `Not a valid Liquid Flow configuration file.` |
| `ShareFilePath` | `Ścieżka pliku` | `File path` |
| `ShareExporting` | `Eksportowanie…` | `Exporting…` |
| `ShareImporting` | `Importowanie…` | `Importing…` |
| `ShareExportedTo` | `Wyeksportowano {count} sklepów do {path}` | `Exported {count} shops to {path}` |
| `ShareImportedResult` | `Zaimportowano: {added} dodane, {updated} zaktualizowane, {skipped} pominięte` | `Imported: {added} added, {updated} updated, {skipped} skipped` |
| `ShareNothingSelected` | `Nie wybrano żadnego sklepu.` | `No shops selected.` |
| `ShareFileReadFailed` | `Nie udało się odczytać pliku: {path}` | `Could not read file: {path}` |
| `ShareExistsBadge` | `już istnieje` | `already exists` |
| `ShareActionSkip` | `Pomiń` | `Skip` |
| `ShareActionUpdate` | `Nadpisz` | `Update` |
| `ShareActionRename` | `Zmień nazwę` | `Rename` |
| `ShopsExported` | `Wyeksportowano {count} sklepów` | `Exported {count} shops` |
| `ShopsImported` | `Zaimportowano sklepy ({added}/{updated}/{skipped})` | `Imported shops ({added}/{updated}/{skipped})` |
| `CheckListNav` | `↑/↓ wybór · spacja zaznacz · a wszystkie · Enter zatwierdź · Esc anuluj` | `↑/↓ move · space toggle · a all · Enter confirm · Esc cancel` |

(`ShopsExported`/`ShopsImported` are the log-descriptor messages emitted by the
controller. The CLI log helpers `log.tmsg('ShareNothingSelected')` etc. also need
keys — every `tmsg`/`t.X` key used in Phases B–E must exist here.)

**Verify**: `npx vitest run packages/core/src/translations.test.js` → pass, AND
the untranslated-scan from CLAUDE.md returns `[]`:
`node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;const bad=Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k]));if(bad.length)throw new Error('untranslated: '+bad);console.log('ok')})"`

#### Step F2: Version bump + changelog

- Bump `version` `0.9.147` → `0.9.148` in all four: `package.json`,
  `apps/cli/package.json`, `packages/core/package.json`, `apps/mcp/package.json`.
- Prepend to `CHANGELOG.md` under `# Changelog`:
  ```
  ## [0.9.148] — 2026-07-04
  ### Added
  - Share shop configuration between machines: in-app export/import of selected
    shops (CLI and desktop), passphrase-protected (PBKDF2 + AES-256-GCM), with a
    per-shop selection step and name-collision resolution (skip/update/rename).
    Passwords are re-encrypted under the importing machine's local key; the MCP
    server is intentionally excluded.
  ```

**Verify**: `grep -l '"version": "0.9.148"' package.json apps/cli/package.json packages/core/package.json apps/mcp/package.json` lists all four.

---

## Test plan

New test files (all collected by `npm test`):

- `packages/core/src/shareConfig.test.js` — crypto roundtrip, wrong/missing
  passphrase, no-passphrase secret-stripping, `BadFormat`, no-plaintext assertion.
- `packages/core/src/controller.share.test.js` — export (ids filter, secret
  inclusion by passphrase, no plaintext in output), preview (exists flags,
  translated passphrase errors), import (add/update/skip, rename via add-uniquify,
  re-encryption under local key, crafted-name rejection).
- `apps/cli/src/components/CheckList.test.jsx` — nav, toggle, toggle-all, conflict
  action cycling, confirm payload, Esc.

Existing tests must stay green: `packages/core/src/translations.test.js` (parity),
plus the whole suite via `npm test`.

Final verification: `npm test` → all pass, including the three new files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0; the three new test files exist and pass.
- [ ] `node -e "import('@liquidflow/core').then(m=>{if(!m.shareConfig)throw 0})"` prints nothing/exits 0.
- [ ] `npx vitest run packages/core/src/translations.test.js` passes and the
      untranslated-scan (Step F1) prints `ok`.
- [ ] `node --check apps/desktop/electron/main.js` and `preload.cjs` exit 0.
- [ ] `grep -rn "shareConfig\|exportShops\|importShops\|importPreview" apps/mcp` returns **no matches** (MCP untouched).
- [ ] All four `package.json` show `0.9.148`; `CHANGELOG.md` has the `[0.9.148]` section.
- [ ] `git status` shows only in-scope files modified/created.
- [ ] `plans/README.md` status row for 030 updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `b49b1d6`) —
  especially the shop record shape (`controller.js:148-156`), the four RPC wiring
  points, or the `/connect` footer in `commands.js`.
- You cannot find `openConnect` in `apps/cli/src/App.jsx` (the overlay/mode
  registration pattern the new `CheckList` screen must follow has changed) — the
  CLI nav model is intricate (see the extensive `CLAUDE.md` notes) and guessing
  will corrupt it. Report and ask.
- The desktop `ctrl` in `main.js` turns out **not** to be a daemon client (i.e.
  the crypto would run outside the process that owns the local `.key`) — this
  breaks the re-encryption model; report before proceeding.
- Any step's verification fails twice after a reasonable fix.
- Implementing any step appears to require editing an out-of-scope file
  (especially anything under `apps/mcp/` or `store.js`'s crypto).

## Maintenance notes

For whoever owns this next:

- **Security posture**: the export bundle protects passwords with a
  user-passphrase (PBKDF2-SHA256, 210k iters, AES-256-GCM). Plaintext passwords
  exist only in memory in the daemon during build/read; they are never written to
  disk (blank passphrase strips them entirely). The renderer/CLI never receives
  decrypted passwords back from `importPreview` — only Name/Url/flags. Keep it
  that way; do not add passwords to the preview payload.
- **Untrusted input**: an import file is attacker-controllable. Imported shop
  names are re-validated to `^[A-Za-z0-9]+$` before becoming directory names
  (`_validShopName`) — this guards `shopDir`/`deleteShopDir` path traversal. If
  you ever loosen shop-name rules in `signInShop`, revisit this validation.
- **Format versioning**: the envelope carries `version: 1`. If the shape changes,
  bump it and branch in `readEnvelope`; old files should still import.
- **MCP boundary is intentional**: MCP has no export/import and must never gain
  password access. Don't "add it for symmetry."
- **Reviewer focus**: (1) no plaintext password ever crosses the daemon boundary
  or lands on disk; (2) the four RPC wiring points all present and consistent;
  (3) i18n parity (`translations.test.js`); (4) collision handling matches the
  UI's Skip/Update/Rename mapping (`rename` → controller `add` → unique suffix).
- **Deferred**: no "merge templates/local files" — this shares connection config
  only. Bulk re-connect after import (auto sign-in to all imported shops) was not
  requested and is left out.
