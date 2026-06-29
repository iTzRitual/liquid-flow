// Centralny kontroler aplikacji — cała logika stanu (sklepy, szablony, sesja
// synchronizacji, git) niezależna od warstwy prezentacji. Używany zarówno przez
// aplikację desktopową (Electron/IPC), jak i CLI; emituje zdarzenia 'log',
// 'mismatches', 'state', 'git'.

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import * as store from './store.js';
import * as logbuf from './log.js';
import * as git from './git.js';
import { ISklep24Client, SoapError } from './soap.js';
import { SyncSession } from './syncEngine.js';
import { translationsFor, tfmt, LANGUAGES } from './translations.js';

const COMMIT_DEBOUNCE_MS = 3000;

// Ukryta gałąź robocza („bufor na żywo"): wszystkie auto-commity lądują tutaj.
// Użytkownik jej nie widzi ani nie wybiera — jest implementacyjnym szczegółem
// modelu „checkpoint". Strumień docelowy (gałąź, na którą zatwierdza się wersję)
// trzymamy w activeGit.targetBranch (domyślnie poniżej).
const WIP_BRANCH = 'liquidflow/wip';
const DEFAULT_TARGET = 'main';

// Wersja aplikacji — czytana z package.json rdzenia (jedyne źródło prawdy; trzy
// package.json są zawsze zsynchronizowane), żeby nie dryfowała przy bumpie.
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

    // Trzymamy referencje do handlerów, żeby dispose() mógł je odpiąć od
    // GLOBALNEGO emitera logbuf.events (inaczej każdy Controller zostawia
    // nasłuchy na zawsze — wyciek + przekroczenie limitu listenerów).
    this._onLogEntry = (e) => this.emit('log', e);
    this._onLogReset = (entries) => this.emit('log:reset', entries);
    logbuf.events.on('entry', this._onLogEntry);
    logbuf.events.on('reset', this._onLogReset);
  }

  // ---------- pomocnicze ----------
  // Tłumaczenia dla bieżącego języka (logi/błędy widoczne dla użytkownika).
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
      // Preferencje UI (CLI) trzymane w configu, by przeżyć restart.
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

  // Preferencje UI CLI (zawijanie logów, tryb nagłówka). Zapisywane w configu,
  // więc pamiętane między uruchomieniami. Whitelist kluczy; po zapisie 'state'.
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
    // Przerysuj bieżący log na nowy język (wpisy z deskryptorem i18n) — emituje
    // 'reset' → 'log:reset', więc UI podmienia cały widoczny strumień.
    logbuf.setLanguage(id);
    this.emitState();
    return this.getTranslations();
  }

  // ---------- sklepy ----------
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

  // Logowanie do istniejącego sklepu przy użyciu zapisanego (zaszyfrowanego)
  // hasła — bez ponownego wpisywania. Wymaga shop.SavePassword + shop.Password.
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

  // Rozłączenie (wylogowanie) bez usuwania sklepu z konfiguracji: zatrzymuje
  // synchronizację i czyści bieżącą sesję/klienta. Sklep i zapisane hasło
  // zostają — można połączyć się ponownie.
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

  // ---------- szablony ----------
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
    // Przełącz log na kanał tego szablonu: wczytaj zapisaną historię (poprzednie
    // sesje, renderowane jako wyszarzone) i oddziel ją separatorem od nowej
    // sesji. Live-wpisy są dopisywane do pliku, więc historia przeżywa restart.
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

    // git: ustaw konfigurację dla aktywnego szablonu. Repo trzymamy w folderze
    // roboczym '0' (tam edytujemy pliki), a nie na poziomie szablonu — dzięki
    // temu struktura repo to czyste pliki szablonu. Wnętrze .git nie jest
    // synchronizowane do e-Sklep (pomijane jako ścieżka z kropką).
    const tCfg = this._templateConfig(shop.Id, template.Id);
    this.activeGit = {
      dir: store.templateModeDir(shop.Name, template.Id, 0),
      autoCommit: tCfg.git ? !!tCfg.git.autoCommit : false,
      autoPush: tCfg.git ? !!tCfg.git.autoPush : false,
      // strumień docelowy checkpointów (gałąź widoczna dla użytkownika); wip jest ukryty
      targetBranch: (tCfg.git && tCfg.git.targetBranch) || DEFAULT_TARGET,
    };

    if (git.isRepo(this.activeGit.dir)) {
      await this._ensureWipBranch();
    }

    await session.start();
    this.emitState();
    this.emit('mismatches', session.mismatches);
    this.emitGit(); // od razu po starcie sesji odśwież status gita w UI (wiersz „Git" w nagłówku) — inaczej pojawia się dopiero przy pierwszym późniejszym emitGit (toggle/commit)
    return session;
  }

  _templateConfig(shopId, tplId) {
    const sCfg = this.shopById(shopId);
    sCfg.Templates = sCfg.Templates || [];
    let tCfg = sCfg.Templates.find((x) => x.Id === Number(tplId));
    if (!tCfg) { tCfg = { Id: Number(tplId) }; sCfg.Templates.push(tCfg); }
    return tCfg;
  }

  // ---------- konflikty / komendy ----------
  getMismatches() { return this.state.session ? this.state.session.mismatches : []; }

  // Natychmiastowe przeliczenie konfliktów na żądanie (np. przy wejściu w
  // /conflicts) — to samo zapytanie o metadane co cykliczny poll, żeby decyzje
  // o pobraniu/wysłaniu opierały się na świeżym stanie sklepu. refreshMismatches
  // emituje 'mismatches' przez onMismatchChange, więc wskaźnik też się odświeży.
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

  // Ile niezatwierdzonych „wersji" wisi na wip względem strumienia docelowego
  // (commity z wip, których nie ma na targetBranch). 0 = wszystko zacheckpointowane.
  async _uncommittedCount() {
    if (!this.activeGit || !git.isRepo(this.activeGit.dir)) return 0;
    return git.countCommits(this.activeGit.dir, `${this.activeGit.targetBranch}..${WIP_BRANCH}`);
  }

  // Publiczne (CLI guard przed przełączeniem strumienia).
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
      // wip jest ukryty — w UI pokazujemy strumień docelowy, nigdy liquidflow/wip.
      branch: this.activeGit.targetBranch,
      // liczba niezatwierdzonych wersji (commity na wip poza strumieniem)
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
    // odśwież konflikty po przywróceniu
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

  // Zatwierdź wersję: zgnieć pracę z wip w jeden czysty commit na strumieniu
  // docelowym. `target` (opcjonalny) pozwala skierować checkpoint na inną gałąź
  // niż bieżąca — wtedy ta gałąź staje się nowym strumieniem (zapisywana w configu).
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

    const prevTarget = this.activeGit.targetBranch;       // strumień, na którym stoi wip
    const into = target || prevTarget;                    // dokąd zatwierdzamy

    // countCommits jest read-only (git rev-list, nie blokuje indeksu) — bezpieczne poza kolejką.
    // „ahead" liczymy względem bieżącego strumienia (tam zdywergował wip).
    const ahead = await git.countCommits(dir, `${prevTarget}..${WIP_BRANCH}`);

    const checkpointFn = async () => {
      // git.status może odświeżyć indeks — uruchamiamy wewnątrz kolejki.
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

      // Checkpoint na nową gałąź: utwórz ją od bieżącego strumienia (albo wip,
      // gdy strumień jeszcze nie istnieje — świeże repo), by squash dał czysty commit.
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

    // Utrwal nowy strumień docelowy (gdy checkpoint poszedł na inną gałąź).
    if (into !== prevTarget) this._persistTargetBranch(into);

    logbuf.logOk(logbuf.tmsg('GitCheckpointDone', { msg: message || 'Checkpoint' }));
    this.emitGit();
    return this.gitStatus();
  }

  // Zapisz wybrany strumień docelowy w stanie i configu szablonu.
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

  // Przełącz STRUMIEŃ docelowy (nie surowy checkout). Ustawia targetBranch=name
  // i przepina ukryty wip na tę gałąź, więc kolejne auto-commity i checkpointy
  // budują na nowym strumieniu. Gdy na bieżącym strumieniu wiszą niezatwierdzone
  // wersje (wip ahead), wymaga `discard` (inaczej rzuca) — by nie zgubić ich po cichu.
  async gitSwitchBranch(name, { discard = false } = {}) {
    if (!this.activeGit) throw new Error(this.t.NoActiveTemplate);
    const dir = this.activeGit.dir;

    const ahead = await this._uncommittedCount();
    if (ahead > 0 && !discard) {
      throw new Error(tfmt(this.t.GitSwitchUncommitted, { count: ahead }));
    }

    const switchFn = async () => {
      // przepnij wip na nowy strumień (porzuca niezatwierdzone wersje, jeśli były).
      // Najpierw zejdź z wip — gita nie da się force-update na aktualnie wybranej gałęzi.
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
    // wip jest ukryty — nigdy nie pokazujemy go w wyborze gałęzi
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
