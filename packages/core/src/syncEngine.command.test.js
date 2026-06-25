import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { SyncSession, MismatchType } from './syncEngine.js';
import * as store from './store.js';

// Pokrycie orkiestracji command() (akcje z UI): pojedyncze i seryjne operacje,
// w tym usuwanie lokalne/zdalne. Atrapa klienta z rejestrem wywołań.
function fakeClient() {
  return {
    calls: [],
    remoteMeta: [],
    files: {}, // `${Mode}/${Name}` -> { Template, Date }
    setCredentials() {},
    async liquidFilesMetaGet(tpl) {
      this.calls.push(['meta', tpl?.Name]);
      if (tpl && tpl.Name != null) return this.remoteMeta.filter((r) => r.Mode === tpl.Mode && r.Name === tpl.Name);
      return this.remoteMeta;
    },
    async liquidFilesGet(tpl) {
      this.calls.push(['get', tpl.Name]);
      const f = this.files[`${tpl.Mode}/${tpl.Name}`];
      return f ? [{ TemplateId: tpl.TemplateId, Mode: tpl.Mode, Name: tpl.Name, Template: f.Template, Date: f.Date }] : [];
    },
    async liquidFileSet(t) { this.calls.push(['set', t.Name]); },
    async liquidFileAdd(t) { this.calls.push(['add', t.Name]); },
    async liquidFileIsValid() { this.calls.push(['isValid']); return true; },
    async liquidFileDelete(t) { this.calls.push(['delete', t.Name]); },
  };
}

const template = { Id: 7, Name: 'Topaz' };
let shop, client, session, n = 0;
beforeEach(() => {
  shop = { Id: 1, Name: `CmdShop${n++}`, Url: 'http://x', Login: 'webmaster', Password: '' };
  client = fakeClient();
  session = new SyncSession(shop, template, { client, language: 'pl' });
});
afterEach(() => { try { session.dispose(); } catch {} });

const writeLocal = (mode, name, content) => store.writeLocalFile(shop.Name, template.Id, mode, name, Buffer.from(content));
const has = (m, name) => client.calls.some(([k, n]) => k === m && (name === undefined || n === name));

describe('command() — operacje pojedyncze', () => {
  it('download pobiera plik i odświeża konflikty', async () => {
    client.files['0/a.liquid'] = { Template: Buffer.from('DL'), Date: '2026-01-01T00:00:00' };
    await session.command('download', { Mode: 0, Name: 'a.liquid' });
    expect(fs.readFileSync(store.localFilePath(shop.Name, template.Id, 0, 'a.liquid'), 'utf8')).toBe('DL');
    expect(has('get', 'a.liquid')).toBe(true);
  });

  it('removeLocal kasuje plik lokalny i meta', async () => {
    const ts = writeLocal(0, 'r.liquid', 'x');
    store.setMetaEntry(shop.Name, template.Id, 0, 'r.liquid', ts, '2026-01-01');
    await session.command('removeLocal', { Mode: 0, Name: 'r.liquid' });
    expect(fs.existsSync(store.localFilePath(shop.Name, template.Id, 0, 'r.liquid'))).toBe(false);
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, 'r.liquid')).toBeNull();
  });

  it('removeRemote woła liquidFileDelete i usuwa meta', async () => {
    const ts = writeLocal(0, 'rr.liquid', 'x');
    store.setMetaEntry(shop.Name, template.Id, 0, 'rr.liquid', ts, '2026-01-01');
    await session.command('removeRemote', { Mode: 0, Name: 'rr.liquid' });
    expect(has('delete', 'rr.liquid')).toBe(true);
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, 'rr.liquid')).toBeNull();
  });
});

describe('command() — operacje seryjne', () => {
  it('downloadAll pobiera LocalMissing i Timestamp', async () => {
    // jeden LocalMissing (jest zdalnie, brak lokalnie)
    client.remoteMeta = [{ Mode: 0, Name: 'remote.liquid', Date: '2026-01-01T00:00:00' }];
    client.files['0/remote.liquid'] = { Template: Buffer.from('R'), Date: '2026-01-01T00:00:00' };
    await session.refreshMismatches({ silent: true });
    expect(session.mismatches.some((m) => m.Type === MismatchType.LocalMissing)).toBe(true);

    await session.command('downloadAll');
    expect(fs.readFileSync(store.localFilePath(shop.Name, template.Id, 0, 'remote.liquid'), 'utf8')).toBe('R');
  });

  it('uploadAll wysyła RemoteMissing', async () => {
    writeLocal(0, 'local.liquid', 'L'); // lokalny, brak zdalnie → RemoteMissing
    client.remoteMeta = [{ Mode: 0, Name: 'local.liquid', Date: '2026-09-09T00:00:00' }]; // po wysyłce meta
    await session.refreshMismatches({ silent: true });
    // przed wysyłką to RemoteMissing (brak w remoteMeta na moment przeliczenia)…
    // ustaw remoteMeta puste, by wykryć RemoteMissing:
    client.remoteMeta = [];
    await session.refreshMismatches({ silent: true });
    expect(session.mismatches.some((m) => m.Type === MismatchType.RemoteMissing)).toBe(true);

    await session.command('uploadAll');
    expect(has('add', 'local.liquid') || has('set', 'local.liquid')).toBe(true);
  });
});

describe('command() — refresh', () => {
  it('komenda refresh tylko przelicza konflikty (bez operacji plikowych)', async () => {
    client.remoteMeta = [{ Mode: 0, Name: 'x.liquid', Date: '2026-01-01' }];
    await session.command('refresh');
    expect(session.mismatches.some((m) => m.Type === MismatchType.LocalMissing)).toBe(true);
    expect(has('set')).toBe(false);
    expect(has('add')).toBe(false);
  });
});
