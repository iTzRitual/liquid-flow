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

// Testy git uruchamiają wiele podprocesów `git` — pod obciążeniem (pełna suita
// w równoległych workerach) mogą przekroczyć domyślne 5 s. Timeout = 20 s.
describe('Controller — git dla aktywnego szablonu', { timeout: 20000 }, () => {
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

  it('autoCommit commituje na liquidflow/wip i nie wypycha', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const mode0Dir = ctrl.activeGit.dir;
    
    // Stop watcher to prevent race conditions during tests
    ctrl.state.session._stopWatcher();
    
    expect(await git.currentBranch(mode0Dir)).toBe('liquidflow/wip');
    
    const filepath = store.localFilePath(shopName, 5, 0, 'index.liquid');
    fs.writeFileSync(filepath, 'ZMIANA');
    ctrl._pendingCommitFiles.add('index.liquid');
    await ctrl._doAutoCommit();
    
    expect(await git.currentBranch(mode0Dir)).toBe('liquidflow/wip');
    
    await git.switchBranch(mode0Dir, 'main');
    const mainHist = await git.history(mode0Dir);
    expect(mainHist[0].message).toBe('Initial snapshot');
    
    await git.switchBranch(mode0Dir, 'liquidflow/wip');
    const wipHist = await git.history(mode0Dir);
    expect(wipHist[0].message).toContain('index.liquid');
  });

  it('gitCheckpoint squashuje wip do main i wraca do wip', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const mode0Dir = ctrl.activeGit.dir;
    
    // Stop watcher to prevent race conditions during tests
    ctrl.state.session._stopWatcher();
    
    fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'Z1');
    ctrl._pendingCommitFiles.add('index.liquid');
    await ctrl._doAutoCommit();
    fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'Z2');
    ctrl._pendingCommitFiles.add('index.liquid');
    await ctrl._doAutoCommit();
    
    await ctrl.gitCheckpoint('Mój checkpoint');
    
    expect(await git.currentBranch(mode0Dir)).toBe('liquidflow/wip');
    
    await git.switchBranch(mode0Dir, 'main');
    const mainHist = await git.history(mode0Dir);
    expect(mainHist[0].message).toBe('Mój checkpoint');
    expect(mainHist.length).toBe(2);
  });

  it('gitCheckpoint na nową gałąź tworzy ją, kieruje tam i ustawia jako strumień docelowy', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const dir = ctrl.activeGit.dir;
    ctrl.state.session._stopWatcher();

    fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'Z1');
    ctrl._pendingCommitFiles.add('index.liquid');
    await ctrl._doAutoCommit();

    await ctrl.gitCheckpoint('Feature start', 'feature-x');

    // nowy strumień docelowy utrwalony
    expect(ctrl.activeGit.targetBranch).toBe('feature-x');
    // pracujemy dalej na ukrytym wip
    expect(await git.currentBranch(dir)).toBe('liquidflow/wip');
    // checkpoint trafił na feature-x
    await git.switchBranch(dir, 'feature-x');
    expect((await git.history(dir))[0].message).toBe('Feature start');
    // wip jest ukryty w liście gałęzi
    expect(await ctrl.gitListBranches()).not.toContain('liquidflow/wip');
    // status raportuje strumień, nie wip
    expect((await ctrl.gitStatus()).branch).toBe('feature-x');
  });

  it('gitSwitchBranch bez discard rzuca przy niezatwierdzonych wersjach, z discard porzuca i przełącza', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const dir = ctrl.activeGit.dir;
    ctrl.state.session._stopWatcher();

    // utwórz drugi strumień (czysty checkpoint), wróć pracą do main
    fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'A');
    ctrl._pendingCommitFiles.add('index.liquid');
    await ctrl._doAutoCommit();
    await ctrl.gitCheckpoint('cp', 'release'); // target = release teraz
    ctrl._persistTargetBranch('main');         // wróć strumieniem na main do testu

    // nowa niezatwierdzona wersja na wip (względem main)
    fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'B');
    ctrl._pendingCommitFiles.add('index.liquid');
    await ctrl._doAutoCommit();
    expect(await ctrl.gitUncommittedCount()).toBeGreaterThan(0);

    // bez discard → guard
    await expect(ctrl.gitSwitchBranch('release')).rejects.toThrow();
    // z discard → przełącza strumień i porzuca wip
    await ctrl.gitSwitchBranch('release', { discard: true });
    expect(ctrl.activeGit.targetBranch).toBe('release');
    expect(await ctrl.gitUncommittedCount()).toBe(0);
  });

  it('gitPull rzuca błąd, gdy wip jest przed main', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const mode0Dir = ctrl.activeGit.dir;
    
    // Stop watcher to prevent race conditions during tests
    ctrl.state.session._stopWatcher();
    
    fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'Z1');
    ctrl._pendingCommitFiles.add('index.liquid');
    await ctrl._doAutoCommit();
    
    await expect(ctrl.gitPull()).rejects.toThrow();
  });

  it('gitClone pobiera pliki trybu 2 i nasiewa meta dla plików trybu 0', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-sess-bare-'));
    execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: bare });

    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-sess-seed-'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: seedDir });
    fs.writeFileSync(path.join(seedDir, 'index.liquid'), 'WITAJ Z GIT');
    execFileSync('git', ['config', 'user.name', 'Liquid Flow'], { cwd: seedDir });
    execFileSync('git', ['config', 'user.email', 'liquid-flow@local'], { cwd: seedDir });
    execFileSync('git', ['add', '-A'], { cwd: seedDir });
    execFileSync('git', ['commit', '-m', 'seed commit'], { cwd: seedDir });
    execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: seedDir });
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: seedDir });

    const filesXml =
      liquidTemplateXml({ id: 5, mode: 0, name: 'index.liquid', content: 'WITAJ Z GIT', date: '2026-01-01T00:00:00' }) +
      liquidTemplateXml({ id: 5, mode: 2, name: 'layout.liquid', content: 'LAYOUT', date: '2026-01-01T00:00:00' });
    const metaXml =
      liquidTemplateXml({ mode: 0, name: 'index.liquid', date: '2026-01-01T00:00:00' }) +
      liquidTemplateXml({ mode: 2, name: 'layout.liquid', date: '2026-01-01T00:00:00' });

    srv = await startMockSoap({
      handlers: {
        SignIn: () => true,
        Liquid_Get: () => ({ resultXml: TEMPLATE_XML }),
        Liquid_FilesGet: () => ({ resultXml: filesXml }),
        Liquid_FilesMetaGet: () => ({ resultXml: metaXml }),
      },
    });

    const cfg = store.loadConfig();
    cfg.Shops = [{ Id: 1, Name: shopName, Url: srv.url, Login: 'webmaster', SavePassword: true, Password: 'pw' }];
    store.saveConfig(cfg);
    ctrl = new Controller();
    await ctrl.signInSaved(1);

    await ctrl.selectTemplate(5);
    const mode0Dir = ctrl.activeGit.dir;
    
    fs.rmSync(mode0Dir, { recursive: true, force: true });
    
    await ctrl.gitClone(bare);

    expect(fs.readFileSync(path.join(mode0Dir, 'index.liquid'), 'utf8')).toBe('WITAJ Z GIT');

    const mode2Dir = store.templateModeDir(shopName, 5, 2);
    expect(fs.readFileSync(path.join(mode2Dir, 'layout.liquid'), 'utf8')).toBe('LAYOUT');

    const mm = await ctrl.recheckMismatches();
    expect(mm).toHaveLength(0);

    expect(await git.currentBranch(mode0Dir)).toBe('liquidflow/wip');

    fs.rmSync(bare, { recursive: true, force: true });
    fs.rmSync(seedDir, { recursive: true, force: true });
  });

  it('równoległe auto-commity nie kolidują na .git/index.lock', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const dir = ctrl.activeGit.dir;
    fs.writeFileSync(store.localFilePath(shopName, 5, 0, 'index.liquid'), 'A');
    ctrl._pendingCommitFiles.add('index.liquid');
    // Dwa równoległe wywołania — muszą zakończyć się bez błędu index.lock.
    await Promise.all([ctrl._doAutoCommit(), ctrl._doAutoCommit()]);
    expect(await git.currentBranch(dir)).toBe('liquidflow/wip');
  });

  it('gitPull bez skonfigurowanego remote loguje GitNoRemoteConfigured i nie rzuca błędu', async () => {
    await connectAndSelect();
    await ctrl.gitEnable(); // inicjalizuje repo BEZ remote
    const dir = ctrl.activeGit.dir;

    // Upewniamy się, że remote naprawdę nie jest ustawiony.
    expect(await git.getRemote(dir)).toBeNull();

    // Zatrzymaj watcher, by uniknąć race conditions.
    ctrl.state.session._stopWatcher();

    const loggedErrors = [];
    logbuf.events.on('entry', (e) => { if (e.Color === logbuf.COLORS.red) loggedErrors.push(e); });

    // gitPull nie powinien rzucać błędu — ma zalogować i zwrócić gitStatus.
    let result;
    await expect((async () => { result = await ctrl.gitPull(); })()).resolves.not.toThrow();

    // Powinien zalogować komunikat o braku remote.
    expect(loggedErrors.some((e) => e.msg === 'GitNoRemoteConfigured')).toBe(true);

    // Wciąż na gałęzi wip (pull nie nastąpił).
    expect(await git.currentBranch(dir)).toBe('liquidflow/wip');
  });

  it('gitPush bez skonfigurowanego remote loguje GitNoRemoteConfigured i nie rzuca błędu', async () => {
    await connectAndSelect();
    await ctrl.gitEnable();
    const dir = ctrl.activeGit.dir;

    expect(await git.getRemote(dir)).toBeNull();

    const loggedErrors = [];
    logbuf.events.on('entry', (e) => { if (e.Color === logbuf.COLORS.red) loggedErrors.push(e); });

    let result;
    await expect((async () => { result = await ctrl.gitPush(); })()).resolves.not.toThrow();

    expect(loggedErrors.some((e) => e.msg === 'GitNoRemoteConfigured')).toBe(true);
    // Gałąź wip niezmieniona.
    expect(await git.currentBranch(dir)).toBe('liquidflow/wip');
  });
});
