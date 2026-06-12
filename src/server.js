// Lokalny serwer HTTP + REST API odwzorowujące oryginalną aplikację.
// Serwuje wyodrębniony interfejs Angular i steruje silnikiem synchronizacji.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { exec } from 'node:child_process';

import * as store from './store.js';
import * as logbuf from './log.js';
import { ISklep24Client, SoapError } from './soap.js';
import { SyncSession } from './syncEngine.js';
import { translationsFor, LANGUAGES } from './translations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(__dirname, '..', 'web');
const VERSION = '1.0.0 (mac)';

const MIME = {
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export class AppServer {
  constructor(opts = {}) {
    this.config = store.loadConfig();
    this.insecureTLS = !!opts.insecureTLS;
    this.state = {
      currentShopId: null,
      client: null, // ISklep24Client zalogowanego sklepu
      templates: [], // lista Liquid (szablonów) bieżącego sklepu
      pendingTemplate: null, // wybrany, oczekujący (np. zablokowany)
      session: null, // aktywna SyncSession
    };
    this.passwords = new Map(); // shopId -> hasło w pamięci (gdy nie zapisane)
  }

  // ---- pomocnicze ----
  shopById(id) {
    return this.config.Shops.find((s) => s.Id === Number(id));
  }
  currentShop() {
    return this.shopById(this.state.currentShopId);
  }
  shopPassword(shop) {
    if (this.passwords.has(shop.Id)) return this.passwords.get(shop.Id);
    if (shop.SavePassword && shop.Password) return store.decrypt(shop.Password);
    return '';
  }
  shopPublic(shop) {
    if (!shop) return {};
    return {
      Id: shop.Id,
      Name: shop.Name,
      Url: shop.Url,
      Login: shop.Login || 'webmaster',
      SavePassword: !!shop.SavePassword,
    };
  }

  clientForShop(shop) {
    const c = new ISklep24Client(shop.Url, { insecureTLS: this.insecureTLS });
    c.setCredentials(shop.Login || 'webmaster', this.shopPassword(shop));
    return c;
  }

  async loadTemplates(shop) {
    const client = this.state.client && this.state.currentShopId === shop.Id
      ? this.state.client
      : this.clientForShop(shop);
    this.state.client = client;
    this.state.currentShopId = shop.Id;
    this.state.templates = await client.liquidGet();
    return this.state.templates;
  }

  async startSession(template) {
    const shop = this.currentShop();
    if (this.state.session) this.state.session.dispose();
    const sessShop = {
      Id: shop.Id,
      Name: shop.Name,
      Url: shop.Url,
      Login: shop.Login || 'webmaster',
      Password: this.shopPassword(shop),
    };
    const session = new SyncSession(sessShop, template, {
      insecureTLS: this.insecureTLS,
      language: this.config.Language,
      client: this.state.client, // współdziel zalogowaną sesję
    });
    this.state.session = session;
    await session.start();
    return session;
  }

  // ---- serwer ----
  listen() {
    const server = http.createServer((req, res) => this.handle(req, res).catch((e) => {
      this.sendJson(res, 500, { Message: e.message });
    }));
    return new Promise((resolve) => {
      server.listen(this.config.Port, '127.0.0.1', () => resolve(server));
    });
  }

  async handle(req, res) {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = u.pathname;
    const q = u.searchParams;

    // API
    if (p === '/translations') return this.routeTranslations(req, res);
    if (p === '/lang') return this.routeLang(req, res, q);
    if (p === '/currshop') return this.sendJson(res, 200, this.shopPublic(this.currentShop()));
    if (p === '/shop') return this.routeShop(req, res, q);
    if (p === '/template') return this.routeTemplate(req, res, q);
    if (p === '/cnftemplate') return this.routeCnfTemplate(req, res, q);
    if (p === '/log') return this.routeLog(req, res, q);
    if (p === '/console') return this.routeConsole(req, res, q);
    if (p === '/openfolder') return this.routeOpenFolder(req, res);
    if (p === '/quit') { this.sendJson(res, 200, {}); process.exit(0); return; }

    // pliki statyczne (UI)
    return this.serveStatic(req, res, p);
  }

  // ---- statyczne ----
  serveStatic(req, res, p) {
    let rel = p === '/' ? 'page.htm' : p.replace(/^\/+/, '');
    rel = rel.split('?')[0];
    const file = path.normalize(path.join(WEB_DIR, rel));
    if (!file.startsWith(WEB_DIR)) return this.send(res, 403, 'text/plain', 'Forbidden');
    fs.readFile(file, (err, data) => {
      if (err) return this.send(res, 404, 'text/plain', 'Not found');
      const ext = path.extname(file).toLowerCase();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      this.send(res, 200, MIME[ext] || 'application/octet-stream', data);
    });
  }

  // ---- /translations ----
  routeTranslations(req, res) {
    this.sendJson(res, 200, {
      Translations: translationsFor(this.config.Language),
      Version: VERSION,
      Languages: LANGUAGES,
    });
  }

  // ---- /lang ----
  async routeLang(req, res, q) {
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await this.readBody(req);
      const lang = body.LanguageId || body.Id || 'pl';
      this.config.Language = lang;
      store.saveConfig(this.config);
      return this.sendJson(res, 200, { LanguageId: lang });
    }
    this.sendJson(res, 200, { LanguageId: this.config.Language || 'pl' });
  }

  // ---- /shop ----
  async routeShop(req, res, q) {
    if (req.method === 'GET') {
      const id = q.get('id');
      if (id !== null && id !== '' && id !== '0') {
        const shop = this.shopById(id);
        return this.sendJson(res, 200, shop ? this.shopPublic(shop) : {});
      }
      // query() -> lista
      return this.sendJson(res, 200, this.config.Shops.map((s) => this.shopPublic(s)));
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await this.readBody(req);
      return this.saveShop(res, body);
    }

    if (req.method === 'DELETE') {
      const body = await this.readBody(req).catch(() => ({}));
      const id = Number(q.get('id') || body.Id);
      const shop = this.shopById(id);
      if (shop) {
        if (this.state.currentShopId === id) {
          if (this.state.session) { this.state.session.dispose(); this.state.session = null; }
          this.state.currentShopId = null;
          this.state.client = null;
        }
        this.config.Shops = this.config.Shops.filter((s) => s.Id !== id);
        store.saveConfig(this.config);
        this.passwords.delete(id);
      }
      return this.sendJson(res, 200, {});
    }

    this.send(res, 405, 'text/plain', 'Method not allowed');
  }

  async saveShop(res, body) {
    const name = (body.Name || '').trim();
    const url = (body.Url || '').trim().toLowerCase();
    const password = body.Password || '';
    const savePassword = !!body.SavePassword;
    const t = translationsFor(this.config.Language);

    if (!/^[A-Za-z0-9]+$/.test(name)) {
      return this.sendJson(res, 500, { Message: t.InvalidName_AllowedChars + ' A-Za-z0-9' });
    }
    if (!(/^https:\/\/.+$/.test(url) || /^http:\/\/localhost:\d+.*$/.test(url))) {
      return this.sendJson(res, 500, { Message: t.SSL_Required });
    }

    // logowanie
    const client = new ISklep24Client(url, { insecureTLS: this.insecureTLS });
    let ok;
    try {
      ok = await client.signIn('webmaster', password);
    } catch (e) {
      if (e instanceof SoapError && e.faultCodeName === 'Client') {
        return this.sendJson(res, 500, { Message: t.WrongSystemVersion });
      }
      return this.sendJson(res, 500, { Message: e.message });
    }
    if (!ok) return this.sendJson(res, 500, { Message: t.InvalidLoginOrPassword });

    // upsert w konfiguracji
    let shop = this.config.Shops.find((s) => s.Name === name);
    if (!shop) {
      const id = this.config.Shops.length ? Math.max(...this.config.Shops.map((s) => s.Id)) + 1 : 1;
      shop = { Id: id, Name: name, Login: 'webmaster', Templates: [] };
      this.config.Shops.push(shop);
    }
    shop.Url = url;
    shop.SavePassword = savePassword;
    shop.Password = savePassword ? store.encrypt(password) : '';
    store.saveConfig(this.config);

    this.passwords.set(shop.Id, password);
    this.state.currentShopId = shop.Id;
    this.state.client = client;
    client.setCredentials('webmaster', password);
    this.state.templates = [];
    if (this.state.session) { this.state.session.dispose(); this.state.session = null; }

    this.sendJson(res, 200, this.shopPublic(shop));
  }

  // ---- /template ----
  async routeTemplate(req, res, q) {
    const shop = this.currentShop();
    if (!shop) return this.sendJson(res, 200, []);
    const tplId = q.get('tplId');

    if (tplId !== null && tplId !== '') {
      // wybór konkretnego szablonu
      await this.loadTemplates(shop);
      const tpl = this.state.templates.find((x) => x.Id === Number(tplId));
      if (!tpl) return this.sendJson(res, 200, {});
      this.state.pendingTemplate = tpl;
      if (!tpl.Locked) {
        try {
          await this.startSession(tpl);
        } catch (e) {
          logbuf.logErr('Błąd startu synchronizacji: ' + e.message);
          return this.sendJson(res, 500, { Message: e.message });
        }
      }
      return this.sendJson(res, 200, { Id: tpl.Id, Name: tpl.Name, Locked: tpl.Locked });
    }

    // lista szablonów
    try {
      const templates = await this.loadTemplates(shop);
      return this.sendJson(res, 200, templates.map((x) => ({
        Id: x.Id, Name: x.Name, Locked: x.Locked, HasPassword: x.HasPassword,
      })));
    } catch (e) {
      return this.sendJson(res, 500, { Message: e.message });
    }
  }

  // ---- /cnftemplate ----
  async routeCnfTemplate(req, res, q) {
    const shop = this.currentShop();
    const t = translationsFor(this.config.Language);

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await this.readBody(req);
      const tplId = Number(body.Id);
      const tpl = this.state.templates.find((x) => x.Id === tplId) || this.state.pendingTemplate;
      if (!tpl || !shop) return this.sendJson(res, 500, { Message: t.WrongSystemVersion });
      const password = body.Password || '';
      // odblokuj szablon hasłem
      try {
        const ok = await this.state.client.liquidUnlock(tplId, password);
        if (!ok) return this.sendJson(res, 500, { Message: t.InvalidPassword });
      } catch (e) {
        return this.sendJson(res, 500, { Message: e.message });
      }
      // zapisz hasło szablonu (opcjonalnie)
      const sCfg = this.shopById(shop.Id);
      sCfg.Templates = sCfg.Templates || [];
      let tCfg = sCfg.Templates.find((x) => x.Id === tplId);
      if (!tCfg) { tCfg = { Id: tplId, Name: tpl.Name }; sCfg.Templates.push(tCfg); }
      tCfg.SavePassword = !!body.SavePassword;
      tCfg.Password = body.SavePassword ? store.encrypt(password) : '';
      store.saveConfig(this.config);
      tpl.Locked = false;
      await this.startSession(tpl);
      return this.sendJson(res, 200, { Id: tpl.Id, Name: tpl.Name });
    }

    // GET
    const id = q.get('id');
    if (id === '0' || id === null || id === '') {
      // bieżący aktywny szablon
      const s = this.state.session;
      if (!s) return this.sendJson(res, 200, {});
      return this.sendJson(res, 200, { Id: s.templateId, Name: s.template.Name });
    }
    // konfiguracja konkretnego szablonu (ekran odblokowania)
    const tplId = Number(id);
    const tpl = this.state.templates.find((x) => x.Id === tplId) || this.state.pendingTemplate;
    if (!tpl) return this.sendJson(res, 200, {});
    const sCfg = shop ? this.shopById(shop.Id) : null;
    const tCfg = sCfg && sCfg.Templates ? sCfg.Templates.find((x) => x.Id === tplId) : null;
    return this.sendJson(res, 200, {
      Id: tpl.Id,
      Name: tpl.Name,
      SavePassword: tCfg ? !!tCfg.SavePassword : false,
      Password: tCfg && tCfg.SavePassword ? store.decrypt(tCfg.Password) : '',
    });
  }

  // ---- /log (long-poll, jak w oryginale) ----
  async routeLog(req, res, q) {
    const lastId = q.get('lastId') || 0;
    let cancel = null;
    req.on('close', () => { if (cancel) cancel(); });
    const entries = await logbuf.waitFor(lastId, 25000, (fn) => { cancel = fn; });
    if (res.writableEnded || res.destroyed) return;
    this.sendJson(res, 200, entries);
  }

  // ---- /console ----
  async routeConsole(req, res, q) {
    const session = this.state.session;
    if (req.method === 'DELETE') {
      // UI opuszcza widok sync — synchronizacja działa dalej w tle
      return this.sendJson(res, 200, []);
    }
    if (!session) return this.sendJson(res, 498, { Message: 'Brak aktywnej sesji' });

    const comm = q.get('comm');
    if (!comm) {
      // zwykłe zapytanie o listę niezgodności
      return this.sendJson(res, 200, session.mismatches);
    }
    try {
      const fileRaw = q.get('file');
      const file = fileRaw ? JSON.parse(fileRaw) : null;
      const type = q.get('type');
      const result = await session.command(comm, file, type);
      return this.sendJson(res, 200, result);
    } catch (e) {
      return this.sendJson(res, 500, { Message: e.message });
    }
  }

  // ---- /openfolder (dodatek macOS) ----
  routeOpenFolder(req, res) {
    const session = this.state.session;
    if (!session) return this.sendJson(res, 200, {});
    const dir = store.templateDir(session.shopName, session.templateId);
    exec(`open ${JSON.stringify(dir)}`);
    this.sendJson(res, 200, { dir });
  }

  // ---- util ----
  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch { resolve({}); }
      });
      req.on('error', reject);
    });
  }

  send(res, status, contentType, body) {
    res.writeHead(status, { 'Content-Type': contentType });
    res.end(body);
  }

  sendJson(res, status, obj) {
    this.send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj));
  }
}
