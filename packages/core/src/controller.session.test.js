import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { Controller } from './controller.js';
import * as store from './store.js';
import * as logbuf from './log.js';
import * as git from './git.js';
import { startMockSoap, liquidTemplateXml } from '../../../test/helpers/mockSoapServer.js';

// Pełny przepływ przez Controller: wybór szablonu → start sesji (pobranie +
// watcher) → konflikty → git. Mock SOAP zwraca szablon i pliki, więc sesja
// realnie pobiera do tmp home i odpala SyncSession.
let ctrl, srv, shopName, n = 0;
beforeEach(() => {
  try { fs.rmSync(store.paths.CONFIG_PATH); } catch {}
  logbuf.setActiveChannel('app');
  shopName = `SessShop${n++}`;
});
afterEach(async () => {
  if (ctrl) { ctrl.dispose(); ctrl = null; }
  if (srv) { await srv.close(); srv = null; }
});

const TEMPLATE_XML = '<Liquid><Id>5</Id><Name>Topaz</Name><Locked>false</Locked><HasPassword>false</HasPassword></Liquid>';
const FILE = liquidTemplateXml({ id: 5, mode: 0, name: 'index.liquid', content: 'WITAJ', date: '2026-01-01T00:00:00' });
const META = liquidTemplateXml({ mode: 0, name: 'index.liquid', date: '2026-01-01T00:00:00' });

async function connectAndSelect(handlers = {}) {
  srv = await startMockSoap({
    handlers: {
      SignIn: () => true,
      Liquid_Get: () => ({ resultXml: TEMPLATE_XML }),
      Liquid_FilesGet: () => ({ resultXml: FILE }),
      Liquid_FilesMetaGet: () => ({ resultXml: META }),
      ...handlers,
    },
  });
  const cfg = store.loadConfig();
  cfg.Shops = [{ Id: 1, Name: shopName, Url: srv.url, Login: 'webmaster', SavePassword: true, Password: 'pw' }];
  store.saveConfig(cfg);
  ctrl = new Controller();
  await ctrl.signInSaved(1);
  return ctrl.selectTemplate(5);
}

describe('Controller — start sesji szablonu', () => {
  it('selectTemplate pobiera pliki, ustawia sesję i currentTemplate', async () => {
    const r = await connectAndSelect();
    expect(r).toMatchObject({ Id: 5, Name: 'Topaz', Locked: false });

    // plik pobrany do tmp home
    const abs = store.localFilePath(shopName, 5, 0, 'index.liquid');
    expect(fs.readFileSync(abs, 'utf8')).toBe('WITAJ');

    // stan kontrolera odzwierciedla aktywny szablon
    expect(ctrl.getState().currentTemplate).toMatchObject({ Id: 5, Name: 'Topaz' });
    expect(ctrl.currentFolder()).toBe(store.templateDir(shopName, 5));
  });

  it('recheckMismatches po świeżym pobraniu = brak konfliktów', async () => {
    await connectAndSelect();
    const mm = await ctrl.recheckMismatches();
    expect(mm).toEqual([]);
  });

  it('runCommand bez sesji → rzuca', async () => {
    ctrl = new Controller();
    await expect(ctrl.runCommand({ comm: 'download' })).rejects.toThrow();
  });
});

describe('Controller — git dla aktywnego szablonu', () => {
  it('gitStatus przed włączeniem: aktywny, ale nie repo', async () => {
    await connectAndSelect();
    const st = await ctrl.gitStatus();
    expect(st.active).toBe(true);
    expect(st.isRepo).toBe(false);
    expect(st.dir).toBe(store.templateModeDir(shopName, 5, 0));
  });

  it('gitEnable inicjalizuje repo w folderze trybu 0 i włącza autoCommit', async () => {
    await connectAndSelect();
    const st = await ctrl.gitEnable();
    expect(st.isRepo).toBe(true);
    expect(st.autoCommit).toBe(true);
    expect(st.commitCount).toBeGreaterThanOrEqual(1);
    // zapis do config szablonu
    const tcfg = store.loadConfig().Shops[0].Templates.find((x) => x.Id === 5);
    expect(tcfg.git.autoCommit).toBe(true);
  });

  it('gitHistory zwraca commity po init', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const hist = await ctrl.gitHistory(10);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    expect(hist[0].hash).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('gitSetSettings utrwala autoPush w config', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    await ctrl.gitSetSettings({ autoPush: true });
    const tcfg = store.loadConfig().Shops[0].Templates.find((x) => x.Id === 5);
    expect(tcfg.git.autoPush).toBe(true);
  });

  it('metody git bez aktywnego szablonu → rzucają', async () => {
    ctrl = new Controller();
    await expect(ctrl.gitEnable()).rejects.toThrow();
    await expect(ctrl.gitPush()).rejects.toThrow();
  });
});
