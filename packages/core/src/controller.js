// Central application controller — holds all state logic (shops, templates,
// sync session, git) independently of the presentation layer. Used by both the
// desktop application (Electron/IPC) and the CLI; emits the 'log', 'mismatches',
// 'state' and 'git' events.

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import * as store from './store.js';
import * as logbuf from './log.js';
import * as git from './git.js';
import { ISklep24Client, SoapError } from './soap.js';
import { SyncSession } from './syncEngine.js';
import { translationsFor, tfmt, LANGUAGES } from './translations.js';
import { buildShopRecords, buildEnvelope, readEnvelope } from './shareConfig.js';

const COMMIT_DEBOUNCE_MS = 3000;

// Hidden working branch (the "live buffer"): every auto-commit lands here. It is
// neither visible to nor selectable by the user — it is an implementation detail
// of the "checkpoint" model. The target stream (the branch a version is committed
// to) is held in activeGit.targetBranch (default below).
const WIP_BRANCH = 'liquidflow/wip';
const DEFAULT_TARGET = 'main';

// Application version — read from the core package.json (single source of truth;
// the three package.json files are always kept in sync) so it never drifts on bump.
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export class Controller extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.config = store.loadConfig();
    this.insecureTLS = !!opts.insecureTLS;
    this.state = {
      currentShopId: null,
      client: null,
      templates: [],
      pendingTemplate: null,
      session: null,
    };
    this.passwords = new Map();
    this.activeGit = null; // { dir, autoCommit, autoPush }
    this._commitTimer = null;
    this._pendingCommitFiles = new Set();

    // Keep references to the handlers so dispose() can detach them from the
    // GLOBAL logbuf.events emitter (otherwise every Controller leaves listeners
    // attached forever — a leak that eventually exceeds the listener limit).
    this._onLogEntry = (e) => this.emit('log', e);
    this._onLogReset = (entries) => this.emit('log:reset', entries);
    logbuf.events.on('entry', this._onLogEntry);
    logbuf.events.on('reset', this._onLogReset);
  }

  // ---------- helpers ----------
  // Translations for the current language (user-facing logs/errors).
  get t() { return translationsFor(this.config.Language); }

  shopById(id) { return this.config.Shops.find((s) => s.Id === Number(id)); }
  currentShop() { return this.shopById(this.state.currentShopId); }

  shopPassword(shop) {
    if (this.passwords.has(shop.Id)) return this.passwords.get(shop.Id);
    if (shop.SavePassword && shop.Password) return store.decrypt(shop.Password);
    return '';
  }

  shopPublic(shop) {
    if (!shop) return null;
    return {
      Id: shop.Id, Name: shop.Name, Url: shop.Url,
      Login: shop.Login || 'webmaster', SavePassword: !!shop.SavePassword,
      isCurrent: shop.Id === this.state.currentShopId,
    };
  }

  clientForShop(shop) {
    const c = new ISklep24Client(shop.Url, { insecureTLS: this.insecureTLS, language: this.config.Language });
    c.setCredentials(shop.Login || 'webmaster', this.shopPassword(shop));
    return c;
  }

  emitState() { this.emit('state', this.getState()); }

  getState() {
    const s = this.state.session;
    return {
      currentShop: this.shopPublic(this.currentShop()),
      currentTemplate: s ? { Id: s.templateId, Name: s.template.Name } : null,
      language: this.config.Language || 'pl',
      insecureTLS: this.insecureTLS,
      // UI preferences (CLI) stored in the config so they survive a restart.
      logWrap: !!this.config.LogWrap,
      headerMode: this.config.HeaderMode || 'auto',
    };
  }

  getTranslations() {
    return {
      Translations: translationsFor(this.config.Language),
      Languages: LANGUAGES,
      Version: APP_VERSION,
      Language: this.config.Language || 'pl',
    };
  }

  // CLI UI preferences (log wrapping, header mode). Stored in the config so they
  // persist across runs. Keys are whitelisted; emits 'state' after saving.
  setUiPref(key, value) {
    if (key === 'logWrap') this.config.LogWrap = !!value;
    else if (key === 'headerMode') this.config.HeaderMode = value;
    else return this.getState();
    store.saveConfig(this.config);
    this.emitState();
    return this.getState();
  }

  setLanguage(id) {
    this.config.Language = id;
    store.saveConfig(this.config);
    // Re-render the current log in the new language (entries carrying an i18n
    // descriptor) — emits 'reset' → 'log:reset', so the UI swaps the whole stream.
    logbuf.setLanguage(id);
    this.emitState();
    return this.getTranslations();
  }

  // ---------- shops ----------
  listShops() { return this.config.Shops.map((s) => this.shopPublic(s)); }
  getCurrentShop() { return this.shopPublic(this.currentShop()); }

  async signInShop({ Name, Url, Password, SavePassword }) {
    const t = translationsFor(this.config.Language);
    const name = (Name || '').trim();
    const url = (Url || '').trim().toLowerCase();
    if (!/^[A-Za-z0-9]+$/.test(name)) throw new Error(t.InvalidName_AllowedChars + ' A-Za-z0-9');
    if (!(/^https:\/\/.+$/.test(url) || /^http:\/\/localhost:\d+.*$/.test(url))) throw new Error(t.SSL_Required);

    const client = new ISklep24Client(url, { insecureTLS: this.insecureTLS, language: this.config.Language });
    let ok;
    try {
      ok = await client.signIn('webmaster', Password || '');
    } catch (e) {
      if (e instanceof SoapError && e.faultCodeName === 'Client') throw new Error(t.WrongSystemVersion);
      throw e;
    }
    if (!ok) throw new Error(t.InvalidLoginOrPassword);

    let shop = this.config.Shops.find((s) => s.Name === name);
    if (!shop) {
      const id = this.config.Shops.length ? Math.max(...this.config.Shops.map((s) => s.Id)) + 1 : 1;
      shop = { Id: id, Name: name, Login: 'webmaster', Templates: [] };
      this.config.Shops.push(shop);
    }
    shop.Url = url;
    shop.SavePassword = !!SavePassword;
    shop.Password = SavePassword ? store.encrypt(Password || '') : '';
    store.saveConfig(this.config);

    this.passwords.set(shop.Id, Password || '');
    this.state.currentShopId = shop.Id;
    this.state.client = client;
    this.state.templates = [];
    if (this.state.session) { this.state.session.dispose(); this.state.session = null; this.activeGit = null; }
    logbuf.setActiveChannel('shop:' + shop.Id);
    logbuf.logOk(logbuf.tmsg('ConnectedToShop', { name: shop.Name }));
    this.emitState();
    return this.shopPublic(shop);
  }

  // Sign in to an existing shop using the saved (encrypted) password — without
  // re-entering it. Requires shop.SavePassword + shop.Password.
  async signInSaved(id) {
    const t = translationsFor(this.config.Language);
    const shop = this.shopById(Number(id));
    if (!shop) throw new Error(t.ShopNotFound);
    const pwd = this.shopPassword(shop);
    if (!pwd) throw new Error(t.NoSavedPassword);

    const client = new ISklep24Client(shop.Url, { insecureTLS: this.insecureTLS, language: this.config.Language });
    let ok;
    try {
      ok = await client.signIn(shop.Login || 'webmaster', pwd);
    } catch (e) {
      if (e instanceof SoapError && e.faultCodeName === 'Client') throw new Error(t.WrongSystemVersion);
      throw e;
    }
    if (!ok) throw new Error(t.InvalidLoginOrPassword);

    this.passwords.set(shop.Id, pwd);
    this.state.currentShopId = shop.Id;
    this.state.client = client;
    this.state.templates = [];
    if (this.state.session) { this.state.session.dispose(); this.state.session = null; this.activeGit = null; }
    logbuf.setActiveChannel('shop:' + shop.Id);
    logbuf.logOk(logbuf.tmsg('ConnectedToShopSaved', { name: shop.Name }));
    this.emitState();
    return this.shopPublic(shop);
  }

  // Disconnect (sign out) without removing the shop from the config: stops
  // synchronization and clears the current session/client. The shop and its saved
  // password remain, so it can be connected to again.
  logout() {
    if (!this.state.currentShopId) return this.getState();
    const name = this.currentShop() ? this.currentShop().Name : '';
    this.passwords.delete(this.state.currentShopId);
    if (this.state.session) { this.state.session.dispose(); this.state.session = null; }
    this.activeGit = null;
    this.state.currentShopId = null;
    this.state.client = null;
    this.state.templates = [];
    this.state.pendingTemplate = null;
    logbuf.setActiveChannel('app');
    logbuf.logOk(name ? logbuf.tmsg('DisconnectedFrom', { name }) : logbuf.tmsg('Disconnected'));
    this.emitState();
    return this.getState();
  }

  removeShop(id) {
    id = Number(id);
    const shop = this.shopById(id);
    if (!shop) return;
    if (this.state.currentShopId === id) {
      if (this.state.session) { this.state.session.dispose(); this.state.session = null; this.activeGit = null; }
      this.state.currentShopId = null;
      this.state.client = null;
      this.state.templates = [];
      logbuf.setActiveChannel('app');
    }
    const shopName = shop.Name;
    this.config.Shops = this.config.Shops.filter((s) => s.Id !== id);
    store.saveConfig(this.config);
    this.passwords.delete(id);
    store.deleteShopDir(shopName);
    this.emitState();
  }

  // ---------- config sharing (export / import of shops) ----------
  // Builds a portable bundle from the SELECTED shops. Empty/missing `ids` = all.
  // An empty `passphrase` → a bundle without passwords (the recipient enters them
  // manually). Returns { json, count, encrypted } — the app layer writes `json` to a file.
  exportShops({ ids, passphrase } = {}) {
    const idSet = Array.isArray(ids) && ids.length ? new Set(ids.map(Number)) : null;
    const shops = this.config.Shops.filter((s) => !idSet || idSet.has(Number(s.Id)));
    const includeSecrets = !!(passphrase && String(passphrase).length);
    const records = buildShopRecords(shops, store.decrypt, includeSecrets);
    const envelope = buildEnvelope(records, passphrase);
    logbuf.logOk(logbuf.tmsg('ShopsExported', { count: records.length }));
    return { json: JSON.stringify(envelope, null, 2), count: records.length, encrypted: !!envelope.encrypted };
  }

  // Bundle preview — does NOT return passwords to the UI. A list of shops plus the
  // exists/hasPassword flags and `encrypted`. Throws a translated error (bad passphrase, etc.).
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

  // Import selected shops. `selections` = [{ Name, action, saveAs? }],
  //   action: 'add' | 'update' | 'skip'. Missing `selections` → add all.
  // Returns { added, updated, skipped }.
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
      } else { // 'add' (and "rename": add always avoids collisions via a suffix)
        this._addImportedShop(rec, this._uniqueShopName(d.saveAs || rec.Name)); added++;
      }
    }
    store.saveConfig(this.config);
    logbuf.logOk(logbuf.tmsg('ShopsImported', { added, updated, skipped }));
    this.emitState();
    return { added, updated, skipped };
  }

  // --- import/export helpers ---
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
    let i = 2, cand;
    do { cand = name + i++; } while (names.has(cand));
    return cand;
  }
  // Overwrite the connection fields of an existing shop from a record (re-encrypting
  // with THIS machine's LOCAL key). Leaves the Id and on-disk files untouched.
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

  // ---------- templates ----------
  async listTemplates() {
    const shop = this.currentShop();
    if (!shop) return [];
    const client = (this.state.client && this.state.currentShopId === shop.Id)
      ? this.state.client : this.clientForShop(shop);
    this.state.client = client;
    this.state.templates = await client.liquidGet();
    return this.state.templates.map((x) => ({ Id: x.Id, Name: x.Name, Locked: x.Locked, HasPassword: x.HasPassword }));
  }

  async selectTemplate(tplId) {
    const shop = this.currentShop();
    if (!shop) throw new Error(this.t.NoShopSelected);
    if (!this.state.templates.length) await this.listTemplates();
    const tpl = this.state.templates.find((x) => x.Id === Number(tplId));
    if (!tpl) throw new Error(this.t.TemplateNotFound);
    this.state.pendingTemplate = tpl;
    if (!tpl.Locked) await this._startSession(tpl);
    return { Id: tpl.Id, Name: tpl.Name, Locked: tpl.Locked };
  }

  async unlockTemplate({ tplId, Password, SavePassword }) {
    const shop = this.currentShop();
    const t = translationsFor(this.config.Language);
    tplId = Number(tplId);
    const tpl = this.state.templates.find((x) => x.Id === tplId) || this.state.pendingTemplate;
    if (!tpl || !shop) throw new Error(t.WrongSystemVersion);
    const ok = await this.state.client.liquidUnlock(tplId, Password || '');
    if (!ok) throw new Error(t.InvalidPassword);
    const sCfg = this.shopById(shop.Id);
    sCfg.Templates = sCfg.Templates || [];
    let tCfg = sCfg.Templates.find((x) => x.Id === tplId);
    if (!tCfg) { tCfg = { Id: tplId, Name: tpl.Name }; sCfg.Templates.push(tCfg); }
    tCfg.SavePassword = !!SavePassword;
    tCfg.Password = SavePassword ? store.encrypt(Password || '') : '';
    store.saveConfig(this.config);
    tpl.Locked = false;
    await this._startSession(tpl);
    return { Id: tpl.Id, Name: tpl.Name };
  }

  getCurrentTemplate() {
    const s = this.state.session;
    return s ? { Id: s.templateId, Name: s.template.Name } : null;
  }

  async _startSession(template) {
    const shop = this.currentShop();
    if (this.state.session) this.state.session.dispose();
    const sessShop = {
      Id: shop.Id, Name: shop.Name, Url: shop.Url,
      Login: shop.Login || 'webmaster', Password: this.shopPassword(shop),
    };
    // Switch the log to this template's channel: load the saved history (previous
    // sessions, rendered dimmed) and separate it from the new session with a
    // separator. Live entries are appended to the file, so the history survives a restart.
    const history = store.readLogTail(shop.Name, template.Id, 300);
    logbuf.setActiveChannel('tpl:' + shop.Id + ':' + template.Id, {
      persist: (e) => store.appendLogEntry(shop.Name, template.Id, e),
      history,
    });
    if (history.length) {
      logbuf.separator({ key: 'NewSession', ts: new Date().toISOString() });
    }
    logbuf.logOk(logbuf.tmsg('TemplateSelected', { name: template.Name, id: template.Id }));
    const session = new SyncSession(sessShop, template, {
      insecureTLS: this.insecureTLS,
      language: this.config.Language,
      client: this.state.client,
      onSynced: (info) => this._onSynced(info),
      onMismatchChange: (m) => this.emit('mismatches', m),
      onProgress: (p) => this.emit('progress', p),
    });
    this.state.session = session;

    // git: set up the configuration for the active template. The repo lives in the
    // working folder '0' (where files are edited), not at the template level — so
    // the repo structure is the pure template files. The .git contents are not
    // synchronized to e-Sklep (skipped as a dot-prefixed path).
    const tCfg = this._templateConfig(shop.Id, template.Id);
    this.activeGit = {
      dir: store.templateModeDir(shop.Name, template.Id, 0),
      autoCommit: tCfg.git ? !!tCfg.git.autoCommit : false,
      autoPush: tCfg.git ? !!tCfg.git.autoPush : false,
      // checkpoint target stream (the branch visible to the user); wip is hidden
      targetBranch: (tCfg.git && tCfg.git.targetBranch) || DEFAULT_TARGET,
    };

    if (git.isRepo(this.activeGit.dir)) {
      await this._ensureWipBranch();
    }

    await session.start();
    this.emitState();
    this.emit('mismatches', session.mismatches);
    this.emitGit(); // refresh the git status in the UI right after the session starts (the "Git" row in the header) — otherwise it appears only on the first later emitGit (toggle/commit)
    return session;
  }

  _templateConfig(shopId, tplId) {
    const sCfg = this.shopById(shopId);
    sCfg.Templates = sCfg.Templates || [];
    let tCfg = sCfg.Templates.find((x) => x.Id === Number(tplId));
    if (!tCfg) { tCfg = { Id: Number(tplId) }; sCfg.Templates.push(tCfg); }
    return tCfg;
  }

  // ---------- conflicts / commands ----------
  getMismatches() { return this.state.session ? this.state.session.mismatches : []; }

  // Recompute conflicts on demand (e.g. when entering /conflicts) — the same
  // metadata request as the periodic poll, so download/upload decisions are based
  // on a fresh shop state. refreshMismatches emits 'mismatches' via onMismatchChange,
  // so the indicator also refreshes.
  async recheckMismatches() {
    if (!this.state.session) return [];
    return this.state.session.refreshMismatches({ silent: true });
  }

  async runCommand({ comm, file, type }) {
    if (!this.state.session) throw new Error(this.t.NoActiveSyncSession);
    const result = await this.state.session.command(comm, file, type);
    this.emit('mismatches', result);
    return result;
  }

  async previewConflict(file, type) {
    if (!this.state.session) return null;
    return this.state.session.previewConflict(file, type);
  }

  getLog(sinceId = 0) { return logbuf.since(sinceId); }

  // ---------- git ----------
  async _onSynced(info) {
    if (info && info.label) this._pendingCommitFiles.add(info.label);
    if (!this.activeGit || !this.activeGit.autoCommit) return;
    if (this._commitTimer) clearTimeout(this._commitTimer);
    this._commitTimer = setTimeout(() => this._doAutoCommit().catch(() => {}), COMMIT_DEBOUNCE_MS);
  }

  async _ensureWipBranch() {
    if (!this.activeGit || !git.isRepo(this.activeGit.dir)) return;
    const dir = this.activeGit.dir;
    const cur = await git.currentBranch(dir);
    if (cur === WIP_BRANCH) return;

    const branches = await git.listBranches(dir);
    if (!branches.includes(WIP_BRANCH)) {
      const target = this.activeGit.targetBranch;
      const base = branches.includes(target) ? target : (cur || target);
      await git.createBranch(dir, WIP_BRANCH, base);
    }
    await git.switchBranch(dir, WIP_BRANCH);
  }

  // How many uncommitted "versions" are pending on wip relative to the target
  // stream (commits on wip that are not on targetBranch). 0 = everything checkpointed.
  async _uncommittedCount() {
    if (!this.activeGit || !git.isRepo(this.activeGit.dir)) return 0;
    return git.countCommits(this.activeGit.dir, `${this.activeGit.targetBranch}..${WIP_BRANCH}`);
  }

  // Public (CLI guard before switching the stream).
  async gitUncommittedCount() {
    return this._uncommittedCount();
  }

  async _doAutoCommit() {
    if (!this.activeGit) return;
    const files = [...this._pendingCommitFiles];
    this._pendingCommitFiles.clear();
    const t = this.t;
    const msg = files.length === 1
      ? tfmt(t.GitCommitSyncOne, { file: files[0] })
      : tfmt(t.GitCommitSyncMany, { count: files.length, files: files.slice(0, 3).join(', ') + (files.length > 3 ? '…' : '') });
    const commitFn = async () => {
      if (!git.isRepo(this.activeGit.dir)) await git.init(this.activeGit.dir);
      await this._ensureWipBranch();
      const r = await git.commitAll(this.activeGit.dir, msg);
      if (r.committed) {
        logbuf.logInfo(logbuf.tmsg('GitVersionSaved', { hash: r.hash }));
        this.emitGit();
      }
    };
    try {
      if (this.state.session) await this.state.session.runExclusive(commitFn);
      else await commitFn();
    } catch (e) {
      logbuf.logErr(logbuf.tmsg('GitCommitError', { msg: e.message }));
    }
  }

  async gitStatus() {
    if (!this.activeGit) return { available: await git.isAvailable(), active: false };
    const st = await git.status(this.activeGit.dir);
    const tCfg = this._currentTemplateConfig();
    const ahead = await this._uncommittedCount();
    return {
      available: await git.isAvailable(),
      active: true,
      dir: this.activeGit.dir,
      autoCommit: this.activeGit.autoCommit,
      autoPush: this.activeGit.autoPush,
      ...st,
      // wip is hidden — the UI shows the target stream, never liquidflow/wip.
      branch: this.activeGit.targetBranch,
      // number of uncommitted versions (commits on wip outside the stream)
      ahead,
      _tcfg: tCfg ? !!tCfg.git : false,
    };
  }

  _currentTemplateConfig() {
    const s = this.state.session;
    if (!s) return null;
    return this._templateConfig(this.currentShop().Id, s.templateId);
  }

  emitGit() { this.gitStatus().then((s) => this.emit('git', s)).catch(() => {}); }

  async gitEnable() {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    if (!(await git.isAvailable())) throw new Error(this.t.GitNotInstalled);
    const initFn = async () => {
      await git.init(this.activeGit.dir);
      await this._ensureWipBranch();
    };
    if (this.state.session) await this.state.session.runExclusive(initFn);
    else await initFn();
    this.activeGit.autoCommit = true;
    const tCfg = this._currentTemplateConfig();
    tCfg.git = { ...(tCfg.git || {}), autoCommit: true };
    store.saveConfig(this.config);
    logbuf.logOk(logbuf.tmsg('GitEnabledForTemplate'));
    this.emitGit();
    return this.gitStatus();
  }

  async gitSetSettings({ autoCommit, autoPush }) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    if (autoCommit !== undefined) this.activeGit.autoCommit = !!autoCommit;
    if (autoPush !== undefined) this.activeGit.autoPush = !!autoPush;
    const tCfg = this._currentTemplateConfig();
    tCfg.git = { ...(tCfg.git || {}), autoCommit: this.activeGit.autoCommit, autoPush: this.activeGit.autoPush };
    store.saveConfig(this.config);
    if (this.activeGit.autoCommit && !git.isRepo(this.activeGit.dir)) {
      const initFn = async () => {
        await git.init(this.activeGit.dir);
        await this._ensureWipBranch();
      };
      if (this.state.session) await this.state.session.runExclusive(initFn);
      else await initFn();
    }
    this.emitGit();
    return this.gitStatus();
  }

  async gitHistory(limit = 100) {
    if (!this.activeGit) return [];
    return git.history(this.activeGit.dir, limit);
  }

  async gitRestore(hash) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const dir = this.activeGit.dir;
    const restoreFn = () => git.restore(dir, hash, tfmt(this.t.GitRestoreCommit, { hash }));
    const r = this.state.session ? await this.state.session.runExclusive(restoreFn) : await restoreFn();
    logbuf.logOk(logbuf.tmsg('GitVersionRestored', { hash }));
    // refresh conflicts after the restore
    if (this.state.session) await this.state.session.refreshMismatches();
    this.emitGit();
    return r;
  }

  async gitSetRemote(url) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    if (!git.isRepo(this.activeGit.dir)) await git.init(this.activeGit.dir);
    await git.setRemote(this.activeGit.dir, url);
    logbuf.logOk(logbuf.tmsg('GitRemoteSet'));
    this.emitGit();
    return this.gitStatus();
  }

  async gitPush() {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const remote = await git.getRemote(this.activeGit.dir);
    if (!remote) { logbuf.logErr(logbuf.tmsg('GitNoRemoteConfigured')); return this.gitStatus(); }
    const r = await git.push(this.activeGit.dir, this.activeGit.targetBranch);
    logbuf.logOk(logbuf.tmsg('GitPushedOrigin'));
    this.emitGit();
    return r;
  }

  // Commit a version: squash the work from wip into a single clean commit on the
  // target stream. The optional `target` lets the checkpoint go to a branch other
  // than the current one — that branch then becomes the new stream (saved in the config).
  async gitCheckpoint(message, target) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const dir = this.activeGit.dir;
    if (!git.isRepo(dir)) throw new Error(this.t.NoGitRepository || 'No git repository');

    if (this._commitTimer) {
      clearTimeout(this._commitTimer);
      this._commitTimer = null;
    }
    // Flush pending auto-commit first (self-queues via runExclusive).
    await this._doAutoCommit();

    const prevTarget = this.activeGit.targetBranch;       // the stream wip sits on
    const into = target || prevTarget;                    // where we commit to

    // countCommits is read-only (git rev-list, does not lock the index) — safe outside the queue.
    // "ahead" is counted relative to the current stream (where wip diverged).
    const ahead = await git.countCommits(dir, `${prevTarget}..${WIP_BRANCH}`);

    const checkpointFn = async () => {
      // git.status may refresh the index — run it inside the queue.
      const st = await git.status(dir);
      if (ahead === 0 && !st.dirty) {
        return { nothing: true };
      }

      if (st.dirty) {
        const r = await git.commitAll(dir, message || 'Checkpoint');
        if (r.committed) {
          logbuf.logInfo(logbuf.tmsg('GitVersionSaved', { hash: r.hash }));
        }
      }

      // Checkpoint onto a new branch: create it from the current stream (or wip,
      // when the stream does not exist yet — a fresh repo) so the squash yields a clean commit.
      const branches = await git.listBranches(dir);
      if (!branches.includes(into)) {
        const base = branches.includes(prevTarget) ? prevTarget : WIP_BRANCH;
        await git.createBranch(dir, into, base);
      }

      const res = await git.squashMergeInto(dir, WIP_BRANCH, into, message || 'Checkpoint');
      await git.forceBranch(dir, WIP_BRANCH, into);
      await git.switchBranch(dir, WIP_BRANCH);
      if (this.activeGit.autoPush) {
        const remote = await git.getRemote(dir);
        if (!remote) {
          logbuf.logErr(logbuf.tmsg('GitNoRemoteConfigured'));
        } else {
          try {
            await git.push(dir, into);
            logbuf.logOk(logbuf.tmsg('GitPushedOrigin'));
          } catch (e) {
            logbuf.logErr(logbuf.tmsg('GitPushError', { msg: e.message }));
          }
        }
      }
      return res;
    };

    let res;
    if (this.state.session) {
      res = await this.state.session.withWatcherPaused(checkpointFn);
    } else {
      res = await checkpointFn();
    }

    if (res && res.nothing) {
      logbuf.logInfo(logbuf.tmsg('GitNothingToCheckpoint'));
      return this.gitStatus();
    }

    // Persist the new target stream (when the checkpoint went to a different branch).
    if (into !== prevTarget) this._persistTargetBranch(into);

    logbuf.logOk(logbuf.tmsg('GitCheckpointDone', { msg: message || 'Checkpoint' }));
    this.emitGit();
    return this.gitStatus();
  }

  // Save the chosen target stream in the state and the template config.
  _persistTargetBranch(branch) {
    this.activeGit.targetBranch = branch;
    const tCfg = this._currentTemplateConfig();
    if (tCfg) {
      tCfg.git = { ...(tCfg.git || {}), targetBranch: branch };
      store.saveConfig(this.config);
    }
  }

  async gitPull() {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const dir = this.activeGit.dir;
    if (!git.isRepo(dir)) throw new Error(this.t.NoGitRepository || 'No git repository');

    const target = this.activeGit.targetBranch;
    const ahead = await git.countCommits(dir, `${target}..${WIP_BRANCH}`);
    if (ahead > 0) {
      throw new Error(this.t.GitPublishBeforePull);
    }

    const remote = await git.getRemote(dir);
    if (!remote) { logbuf.logErr(logbuf.tmsg('GitNoRemoteConfigured')); return this.gitStatus(); }

    const pullFn = async () => {
      await git.switchBranch(dir, target);
      try {
        await git.pull(dir);
        logbuf.logOk(logbuf.tmsg('GitPullSuccess'));
      } finally {
        await git.forceBranch(dir, WIP_BRANCH, target);
        await git.switchBranch(dir, WIP_BRANCH);
      }
    };

    if (this.state.session) {
      await this.state.session.withWatcherPaused(pullFn);
    } else {
      await pullFn();
    }

    this.emitGit();
    return this.gitStatus();
  }

  async gitCreateBranch(name) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const dir = this.activeGit.dir;
    if (this.state.session) {
      await this.state.session.withWatcherPaused(() => git.createBranch(dir, name));
    } else {
      await git.createBranch(dir, name);
    }
    this.emitGit();
    return this.gitStatus();
  }

  // Switch the target STREAM (not a raw checkout). Sets targetBranch=name and
  // re-points the hidden wip to that branch, so subsequent auto-commits and
  // checkpoints build on the new stream. When the current stream has uncommitted
  // versions pending (wip ahead), it requires `discard` (otherwise throws) — so they are not lost silently.
  async gitSwitchBranch(name, { discard = false } = {}) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const dir = this.activeGit.dir;

    const ahead = await this._uncommittedCount();
    if (ahead > 0 && !discard) {
      throw new Error(tfmt(this.t.GitSwitchUncommitted, { count: ahead }));
    }

    const switchFn = async () => {
      // re-point wip to the new stream (discards uncommitted versions, if any).
      // First leave wip — git cannot force-update the currently checked-out branch.
      await git.switchBranch(dir, name);
      await git.forceBranch(dir, WIP_BRANCH, name);
      await git.switchBranch(dir, WIP_BRANCH);
    };
    if (this.state.session) {
      await this.state.session.withWatcherPaused(switchFn);
    } else {
      await switchFn();
    }
    this._persistTargetBranch(name);
    this.emitGit();
    return this.gitStatus();
  }

  async gitListBranches() {
    if (!this.activeGit) return [];
    // wip is hidden — never show it in the branch picker
    return (await git.listBranches(this.activeGit.dir)).filter((b) => b !== WIP_BRANCH);
  }

  async gitClone(url) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    if (!this.state.session) throw new Error(this.t.NoActiveSyncSession);
    const shop = this.currentShop();
    const tplId = this.state.session.templateId;
    const dir = this.activeGit.dir; // mode-0 dir

    const localFiles = store.listLocalFiles(shop.Name, tplId);
    if (localFiles.some((f) => f.mode === 0)) {
      throw new Error(this.t.GitCloneDirNotEmpty);
    }

    const cloneFn = async () => {
      await git.cloneInto(dir, url);
      await this._ensureWipBranch();

      logbuf.logInfo(logbuf.tmsg('GitCloneDownloadingOtherModes'));
      const allFiles = await this.state.session.client.liquidFilesGet({ TemplateId: tplId });
      const nonZeroFiles = allFiles.filter((f) => f.Mode !== 0);

      for (const f of nonZeroFiles) {
        if (!store.isSafeRelName(f.Name)) {
          logbuf.logErr(logbuf.tmsg('UnsafeRemotePath', { name: f.Name }));
        } else {
          const localts = store.writeLocalFile(shop.Name, tplId, f.Mode, f.Name, f.Template || Buffer.alloc(0));
          store.setMetaEntry(shop.Name, tplId, f.Mode, f.Name, localts, f.Date);
        }
      }

      logbuf.logInfo(logbuf.tmsg('GitCloneSeedingMeta'));
      const remoteMeta = await this.state.session.client.liquidFilesMetaGet({ TemplateId: tplId });
      const mode0Meta = remoteMeta.filter((m) => m.Mode === 0);
      const clonedLocalFiles = store.listLocalFiles(shop.Name, tplId).filter((f) => f.mode === 0);

      for (const f of clonedLocalFiles) {
        const match = mode0Meta.find((m) => m.Name === f.name);
        if (match) {
          const localPath = store.localFilePath(shop.Name, tplId, 0, f.name);
          const localts = store.mtimeUtc(localPath);
          store.setMetaEntry(shop.Name, tplId, 0, f.name, localts, match.Date);
        }
      }
    };

    await this.state.session.withWatcherPaused(cloneFn);
    logbuf.logOk(logbuf.tmsg('GitCloneSuccess', { url }));
    this.emitGit();
    return this.gitStatus();
  }

  // ---------- system ----------
  currentFolder() {
    const s = this.state.session;
    return s ? store.templateDir(s.shopName, s.templateId) : null;
  }
  // Local path of a file (to open in an editor/IDE) — the file may not exist on
  // disk (e.g. a LocalMissing conflict), in which case the IDE opens it as a new file.
  localFilePath(file) {
    const s = this.state.session;
    return s ? store.localFilePath(s.shopName, s.templateId, file.Mode, file.Name) : null;
  }
  currentShopUrl() {
    const shop = this.currentShop();
    return shop ? shop.Url : null;
  }

  dispose() {
    if (this.state.session) this.state.session.dispose();
    if (this._commitTimer) clearTimeout(this._commitTimer);
    logbuf.events.off('entry', this._onLogEntry);
    logbuf.events.off('reset', this._onLogReset);
  }
}
