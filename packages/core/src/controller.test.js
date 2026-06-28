import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { Controller } from './controller.js';
import * as store from './store.js';
import * as logbuf from './log.js';
import { startMockSoap } from '../../../test/helpers/mockSoapServer.js';

// config.json ma stałą ścieżkę i jest współdzielony w obrębie pliku — czyścimy
// przed każdym testem, by stan (sklepy/język) nie wyciekał między testami i nie
// zależał od kolejności. Resetujemy też aktywny kanał logu do efemerycznego.
beforeEach(() => {
  try { fs.rmSync(store.paths.CONFIG_PATH); } catch {}
  logbuf.setActiveChannel('app');
});

// Controller buduje ISklep24Client z shop.Url, więc seedujemy sklep wskazujący
// na lokalny mock SOAP (realne gniazdo http) i sprawdzamy orkiestrację stanu,
// zdarzeń i zapisu konfiguracji na realnym `store` (tmp home z setupFile).
let ctrl, srv;
afterEach(async () => {
  if (ctrl) { ctrl.dispose(); ctrl = null; }
  if (srv) { await srv.close(); srv = null; }
});

// Zdarzenia kontrolera — zbierz ostatni 'state'.
function lastState(c) {
  let s = null;
  c.on('state', (x) => { s = x; });
  return () => s;
}

describe('Controller — logowanie (signInShop)', () => {
  it('łączy, ustawia bieżący sklep, zapisuje config i emituje state', async () => {
    srv = await startMockSoap({ host: 'localhost', handlers: { SignIn: () => true } });
    ctrl = new Controller();
    const getState = lastState(ctrl);

    const pub = await ctrl.signInShop({ Name: 'mocksklep', Url: srv.url, Password: 'pw', SavePassword: true });
    expect(pub.Name).toBe('mocksklep');
    expect(getState().currentShop.Name).toBe('mocksklep');

    // zapisane w config.json (z zaszyfrowanym hasłem)
    const cfg = store.loadConfig();
    const saved = cfg.Shops.find((s) => s.Name === 'mocksklep');
    expect(saved).toBeTruthy();
    expect(saved.SavePassword).toBe(true);
    expect(saved.Password).toMatch(/^enc:/); // zaszyfrowane, nie plaintext
  });

  it('odrzuca nazwę z niedozwolonymi znakami', async () => {
    ctrl = new Controller();
    await expect(ctrl.signInShop({ Name: 'zła nazwa', Url: 'https://x.pl', Password: 'p' }))
      .rejects.toThrow();
  });

  it('odrzuca URL bez https (poza http://localhost)', async () => {
    ctrl = new Controller();
    await expect(ctrl.signInShop({ Name: 'sklep', Url: 'http://example.com', Password: 'p' }))
      .rejects.toThrow();
  });

  it('błędne hasło (SignIn=false) → rzuca i nie ustawia sklepu', async () => {
    srv = await startMockSoap({ host: 'localhost', handlers: { SignIn: () => false } });
    ctrl = new Controller();
    await expect(ctrl.signInShop({ Name: 'sklep', Url: srv.url, Password: 'złe' })).rejects.toThrow();
    expect(ctrl.getState().currentShop).toBeNull();
  });
});

describe('Controller — sesja zapisanego sklepu', () => {
  function seedShop(url, extra = {}) {
    const cfg = store.loadConfig();
    cfg.Shops = [{ Id: 1, Name: 'zapisany', Url: url, Login: 'webmaster', SavePassword: true, Password: 'pw', ...extra }];
    store.saveConfig(cfg);
  }

  it('signInSaved łączy bez pytania o hasło', async () => {
    srv = await startMockSoap({ handlers: { SignIn: () => true } });
    seedShop(srv.url);
    ctrl = new Controller();
    const pub = await ctrl.signInSaved(1);
    expect(pub.Name).toBe('zapisany');
    expect(ctrl.getState().currentShop.Name).toBe('zapisany');
  });

  it('signInSaved bez zapisanego hasła → rzuca', async () => {
    seedShop('https://x.pl', { SavePassword: false, Password: '' });
    ctrl = new Controller();
    await expect(ctrl.signInSaved(1)).rejects.toThrow();
  });

  it('listTemplates mapuje wynik Liquid_Get', async () => {
    srv = await startMockSoap({
      handlers: {
        SignIn: () => true,
        Liquid_Get: () => ({ resultXml: '<Liquid><Id>5</Id><Name>Topaz</Name><Locked>false</Locked><HasPassword>false</HasPassword></Liquid>' }),
      },
    });
    seedShop(srv.url);
    ctrl = new Controller();
    await ctrl.signInSaved(1);
    const tpls = await ctrl.listTemplates();
    expect(tpls).toEqual([{ Id: 5, Name: 'Topaz', Locked: false, HasPassword: false }]);
  });

  it('logout czyści bieżący sklep, ale zostawia go w config', async () => {
    srv = await startMockSoap({ handlers: { SignIn: () => true } });
    seedShop(srv.url);
    ctrl = new Controller();
    await ctrl.signInSaved(1);
    ctrl.logout();
    expect(ctrl.getState().currentShop).toBeNull();
    expect(store.loadConfig().Shops).toHaveLength(1); // sklep nadal zapisany
  });
});

describe('Controller — sklepy i język', () => {
  it('removeShop usuwa sklep z config', async () => {
    const cfg = store.loadConfig();
    cfg.Shops = [{ Id: 1, Name: 'a', Url: 'https://a.pl' }, { Id: 2, Name: 'b', Url: 'https://b.pl' }];
    store.saveConfig(cfg);
    ctrl = new Controller();
    ctrl.removeShop(1);
    expect(store.loadConfig().Shops.map((s) => s.Name)).toEqual(['b']);
  });

  it('setLanguage zapisuje config, emituje state i zwraca tłumaczenia', async () => {
    ctrl = new Controller();
    const getState = lastState(ctrl);
    const tr = ctrl.setLanguage('en');
    expect(tr.Language).toBe('en');
    expect(store.loadConfig().Language).toBe('en');
    expect(getState().language).toBe('en');
  });

  it('setUiPref zapisuje preferencje UI w configu i emituje state', async () => {
    ctrl = new Controller();
    const getState = lastState(ctrl);
    ctrl.setUiPref('logWrap', true);
    ctrl.setUiPref('headerMode', 'compact');
    expect(store.loadConfig().LogWrap).toBe(true);
    expect(store.loadConfig().HeaderMode).toBe('compact');
    expect(getState().logWrap).toBe(true);
    expect(getState().headerMode).toBe('compact');
    // nowy Controller czyta zapisane preferencje (pamięć między uruchomieniami)
    ctrl.dispose();
    ctrl = new Controller();
    expect(ctrl.getState().logWrap).toBe(true);
    expect(ctrl.getState().headerMode).toBe('compact');
  });

  it('listShops zwraca publiczny widok (bez hasła) z flagą isCurrent', async () => {
    srv = await startMockSoap({ handlers: { SignIn: () => true } });
    const cfg = store.loadConfig();
    cfg.Shops = [{ Id: 1, Name: 'zapisany', Url: srv.url, Login: 'webmaster', SavePassword: true, Password: 'pw' }];
    store.saveConfig(cfg);
    ctrl = new Controller();
    await ctrl.signInSaved(1);
    const shops = ctrl.listShops();
    expect(shops[0]).not.toHaveProperty('Password');
    expect(shops[0].isCurrent).toBe(true);
  });
});

describe('Controller — cykl życia nasłuchów logbuf', () => {
  it('dispose() odpina globalne nasłuchy entry/reset (brak wycieku)', () => {
    const beforeEntry = logbuf.events.listenerCount('entry');
    const beforeReset = logbuf.events.listenerCount('reset');

    const c = new Controller();
    expect(logbuf.events.listenerCount('entry')).toBe(beforeEntry + 1);
    expect(logbuf.events.listenerCount('reset')).toBe(beforeReset + 1);

    c.dispose();
    expect(logbuf.events.listenerCount('entry')).toBe(beforeEntry);
    expect(logbuf.events.listenerCount('reset')).toBe(beforeReset);
  });
});
