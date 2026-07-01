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

describe('refreshMismatches() — auto-uzgadnianie pozornych konfliktów Timestamp', () => {
  const getCount = (name) => client.calls.filter(([k, n]) => k === 'get' && n === name).length;

  it('identyczna zawartość: konflikt Timestamp NIE pojawia się, meta uzgodnione, bez transferu', async () => {
    writeLocal(0, 'auto.liquid', 'body\ntail');
    // meta z rozjechanym remotets → kandydat Timestamp; ale treść identyczna
    store.setMetaEntry(shop.Name, template.Id, 0, 'auto.liquid', '2020-01-01T00:00:00', '2020-01-01T00:00:00');
    client.remoteMeta = [{ Mode: 0, Name: 'auto.liquid', Date: '2026-05-05T00:00:00' }];
    client.files['0/auto.liquid'] = { Template: Buffer.from('body\ntail'), Date: '2026-05-05T00:00:00' };

    const mm = await session.refreshMismatches({ silent: true });
    // pozorny konflikt zniknął (auto-uzgodniony)
    expect(mm.some((m) => m.File.Name === 'auto.liquid')).toBe(false);
    // treść pobrana raz do porównania, ale żadnego transferu bajtów
    expect(getCount('auto.liquid')).toBe(1);
    expect(has('set')).toBe(false);
    expect(has('add')).toBe(false);
    expect(has('delete')).toBe(false);
    // meta nadpisane bieżącym remotets → kolejny refresh też nic nie zgłasza
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, 'auto.liquid').remotets).toBe('2026-05-05T00:00:00');
    const mm2 = await session.refreshMismatches({ silent: true });
    expect(mm2.some((m) => m.File.Name === 'auto.liquid')).toBe(false);
    expect(getCount('auto.liquid')).toBe(1); // brak nowego pobrania (nie jest już kandydatem)
  });

  it('różna zawartość: konflikt Timestamp POZOSTAJE, meta nietknięte', async () => {
    writeLocal(0, 'real.liquid', 'local body');
    store.setMetaEntry(shop.Name, template.Id, 0, 'real.liquid', '2020-01-01T00:00:00', '2020-01-01T00:00:00');
    client.remoteMeta = [{ Mode: 0, Name: 'real.liquid', Date: '2026-05-05T00:00:00' }];
    client.files['0/real.liquid'] = { Template: Buffer.from('remote body'), Date: '2026-05-05T00:00:00' };

    const mm = await session.refreshMismatches({ silent: true });
    expect(mm.some((m) => m.File.Name === 'real.liquid' && m.Type === MismatchType.Timestamp)).toBe(true);
    // meta bez zmian (nie ukrywamy realnej różnicy)
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, 'real.liquid').remotets).toBe('2020-01-01T00:00:00');
  });

  it('cache: realna różnica nie jest pobierana ponownie przy tych samych znacznikach', async () => {
    writeLocal(0, 'cached.liquid', 'local');
    store.setMetaEntry(shop.Name, template.Id, 0, 'cached.liquid', '2020-01-01T00:00:00', '2020-01-01T00:00:00');
    client.remoteMeta = [{ Mode: 0, Name: 'cached.liquid', Date: '2026-05-05T00:00:00' }];
    client.files['0/cached.liquid'] = { Template: Buffer.from('remote'), Date: '2026-05-05T00:00:00' };

    await session.refreshMismatches({ silent: true });
    expect(getCount('cached.liquid')).toBe(1);
    // drugi refresh z tymi samymi znacznikami → cache „potwierdzone różne", brak pobrania
    await session.refreshMismatches({ silent: true });
    expect(getCount('cached.liquid')).toBe(1);
    expect(session.mismatches.some((m) => m.File.Name === 'cached.liquid')).toBe(true);
  });
});

describe('previewConflict() — podgląd różnic', () => {
  it('Timestamp: oba istnieją → kind:text z diff', async () => {
    writeLocal(0, 'p.liquid', 'local content\nline2');
    client.files['0/p.liquid'] = { Template: Buffer.from('remote content\nline2'), Date: '2026-01-01' };
    const result = await session.previewConflict({ Mode: 0, Name: 'p.liquid' }, 'Timestamp');
    expect(result.kind).toBe('text');
    expect(result.local).toBe('local content\nline2');
    expect(result.remote).toBe('remote content\nline2');
    expect(Array.isArray(result.diff)).toBe(true);
    expect(result.diff.some((d) => d.type === 'del')).toBe(true);
    expect(result.diff.some((d) => d.type === 'add')).toBe(true);
    // wyłącznie do odczytu — brak wywołań set/add/delete
    expect(has('set')).toBe(false);
    expect(has('add')).toBe(false);
    expect(has('delete')).toBe(false);
  });

  it('LocalMissing: brak lokalnie → kind:text, local=null', async () => {
    client.files['0/remote-only.liquid'] = { Template: Buffer.from('tylko zdalne'), Date: '2026-01-01' };
    const result = await session.previewConflict({ Mode: 0, Name: 'remote-only.liquid' }, 'LocalMissing');
    expect(result.kind).toBe('text');
    expect(result.local).toBeNull();
    expect(result.remote).toBe('tylko zdalne');
    // nie powinien próbować czytać lokalnego pliku (nie istnieje)
    const calls = client.calls.filter(([k]) => k === 'get');
    expect(calls.length).toBe(1);
  });

  it('RemoteMissing: brak zdalnie → kind:text, remote=null (bez wywołania get)', async () => {
    writeLocal(0, 'only-local.liquid', 'tylko lokalne');
    const before = client.calls.length;
    const result = await session.previewConflict({ Mode: 0, Name: 'only-local.liquid' }, 'RemoteMissing');
    expect(result.kind).toBe('text');
    expect(result.remote).toBeNull();
    expect(result.local).toBe('tylko lokalne');
    // nie może wołać liquidFilesGet (plik nie istnieje zdalnie)
    const getCalls = client.calls.slice(before).filter(([k]) => k === 'get');
    expect(getCalls.length).toBe(0);
  });

  it('plik obrazkowy → kind:binary', async () => {
    const result = await session.previewConflict({ Mode: 0, Name: 'logo.png' }, 'Timestamp');
    expect(result.kind).toBe('binary');
  });

  it('zawartość binarna (bajt NUL) → kind:binary', async () => {
    const binaryBuf = Buffer.from([72, 101, 108, 0, 108, 111]); // 'Hel\0lo'
    client.files['0/binary.liquid'] = { Template: binaryBuf, Date: '2026-01-01' };
    writeLocal(0, 'binary.liquid', 'lokalna wersja');
    const result = await session.previewConflict({ Mode: 0, Name: 'binary.liquid' }, 'Timestamp');
    expect(result.kind).toBe('binary');
  });
});
