import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { Controller } from './controller.js';
import * as store from './store.js';
import * as logbuf from './log.js';
import { buildEnvelope } from './shareConfig.js';

function resetConfig() {
  store.saveConfig({ StartBrowser: true, Port: 45678, Language: 'pl', LogWrap: false, HeaderMode: 'auto', Shops: [] });
}

beforeEach(() => {
  resetConfig();
  logbuf.setActiveChannel('app');
});

let ctrl;
afterEach(() => {
  if (ctrl) { ctrl.dispose(); ctrl = null; }
});

function seedShop(name = 'TestShop', pass = 'topsecret', tplPass = 'tplsecret') {
  const shop = {
    Id: 1,
    Name: name,
    Url: 'http://testshop.com',
    Login: 'webmaster',
    SavePassword: true,
    Password: store.encrypt(pass),
    Templates: [
      { Id: 10, Name: 'LockedTpl', SavePassword: true, Password: store.encrypt(tplPass) }
    ],
  };
  const cfg = store.loadConfig();
  cfg.Shops.push(shop);
  store.saveConfig(cfg);
  return shop;
}

describe('Controller — exportShops, importPreview, importShops', () => {
  it('exports shops with passphrase without leaking plaintext in JSON', () => {
    seedShop('Shop1', 'topsecret', 'tplsecret');
    ctrl = new Controller();

    const res = ctrl.exportShops({ passphrase: 'p' });
    expect(res.count).toBe(1);
    expect(res.encrypted).toBe(true);
    expect(res.json.includes('topsecret')).toBe(false);
    expect(res.json.includes('tplsecret')).toBe(false);
  });

  it('filters exported shops by ids', () => {
    seedShop('Shop1');
    const cfg = store.loadConfig();
    cfg.Shops.push({ Id: 2, Name: 'Shop2', Url: 'http://shop2.com', Login: 'webmaster', SavePassword: false, Password: '', Templates: [] });
    store.saveConfig(cfg);

    ctrl = new Controller();
    const res = ctrl.exportShops({ ids: [1], passphrase: 'p' });
    expect(res.count).toBe(1);
  });

  it('exports without passwords when passphrase is empty', () => {
    seedShop('Shop1', 'topsecret');
    ctrl = new Controller();

    const res = ctrl.exportShops({ passphrase: '' });
    expect(res.encrypted).toBe(false);

    const preview = ctrl.importPreview({ json: res.json, passphrase: '' });
    expect(preview.encrypted).toBe(false);
    expect(preview.shops[0].hasPassword).toBe(false);
  });

  it('previews shop bundle correctly and flags existing shops', () => {
    seedShop('Shop1');
    ctrl = new Controller();

    const exp = ctrl.exportShops({ passphrase: 'p' });
    const preview1 = ctrl.importPreview({ json: exp.json, passphrase: 'p' });
    expect(preview1.shops[0].exists).toBe(true);

    // On fresh controller
    resetConfig();
    const ctrl2 = new Controller();
    const preview2 = ctrl2.importPreview({ json: exp.json, passphrase: 'p' });
    expect(preview2.shops[0].exists).toBe(false);
    ctrl2.dispose();
  });

  it('importPreview throws translated errors on passphrase issues', () => {
    seedShop('Shop1');
    ctrl = new Controller();
    const exp = ctrl.exportShops({ passphrase: 'p' });

    expect(() => ctrl.importPreview({ json: exp.json, passphrase: '' })).toThrow(ctrl.t.SharePassphraseRequired);
    expect(() => ctrl.importPreview({ json: exp.json, passphrase: 'wrong' })).toThrow(ctrl.t.ShareBadPassphrase);
  });

  it('imports shops into empty controller with re-encrypted local passwords', () => {
    seedShop('Shop1', 'topsecret', 'tplsecret');
    const c1 = new Controller();
    const exp = c1.exportShops({ passphrase: 'p' });
    c1.dispose();

    resetConfig();
    ctrl = new Controller();
    const res = ctrl.importShops({ json: exp.json, passphrase: 'p', selections: [{ Name: 'Shop1', action: 'add' }] });
    expect(res.added).toBe(1);

    const cfg = store.loadConfig();
    expect(cfg.Shops.length).toBe(1);
    const imported = cfg.Shops[0];
    expect(imported.Name).toBe('Shop1');
    expect(imported.Password.startsWith('enc:')).toBe(true);
    expect(store.decrypt(imported.Password)).toBe('topsecret');
    expect(store.decrypt(imported.Templates[0].Password)).toBe('tplsecret');
  });

  it('handles collisions: action update, skip, add (rename uniquify)', () => {
    seedShop('Shop1', 'oldsecret');
    ctrl = new Controller();

    const records = [
      { Name: 'Shop1', Url: 'http://updated.com', Login: 'webmaster', SavePassword: true, Password: 'newsecret', Templates: [] },
    ];
    const env = buildEnvelope(records, 'p');
    const json = JSON.stringify(env);

    // Update
    ctrl.importShops({ json, passphrase: 'p', selections: [{ Name: 'Shop1', action: 'update' }] });
    let cfg = store.loadConfig();
    expect(cfg.Shops.find((s) => s.Name === 'Shop1').Url).toBe('http://updated.com');

    // Skip
    ctrl.importShops({ json, passphrase: 'p', selections: [{ Name: 'Shop1', action: 'skip' }] });
    cfg = store.loadConfig();
    expect(cfg.Shops.length).toBe(1);

    // Add (rename suffix)
    ctrl.importShops({ json, passphrase: 'p', selections: [{ Name: 'Shop1', action: 'add' }] });
    cfg = store.loadConfig();
    expect(cfg.Shops.length).toBe(2);
    expect(cfg.Shops[1].Name).toBe('Shop12');
  });

  it('skips invalid/crafted shop names', () => {
    ctrl = new Controller();
    const records = [
      { Name: '../evil', Url: 'http://evil.com', Login: 'webmaster', SavePassword: false, Password: '', Templates: [] },
    ];
    const env = buildEnvelope(records, 'p');
    const json = JSON.stringify(env);

    const res = ctrl.importShops({ json, passphrase: 'p' });
    expect(res.skipped).toBe(1);
    expect(res.added).toBe(0);
    const cfg = store.loadConfig();
    expect(cfg.Shops.length).toBe(0);
  });
});
