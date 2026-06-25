import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { SyncSession, MismatchType } from './syncEngine.js';
import * as store from './store.js';

// Fake klient SOAP — wstrzykiwany przez opts.client (seam w konstruktorze).
// Wszystkie metody sieciowe podmienione na sterowalne atrapy; `calls` rejestruje
// wywołania do asercji integracyjnych (sync → store, bez prawdziwego SOAP).
function fakeClient(remoteMeta = []) {
  return {
    calls: [],
    remoteMeta, // [{ Mode, Name, Date }]
    remoteFiles: {}, // `${Mode}/${Name}` -> { Template:Buffer, Date }
    setCredentials() {},
    async liquidFilesMetaGet(tpl) {
      this.calls.push(['meta', tpl]);
      if (tpl.Name != null) {
        return this.remoteMeta.filter((r) => r.Mode === tpl.Mode && r.Name === tpl.Name);
      }
      return this.remoteMeta;
    },
    async liquidFilesGet(tpl) {
      this.calls.push(['get', tpl]);
      const f = this.remoteFiles[`${tpl.Mode}/${tpl.Name}`];
      return f ? [{ TemplateId: tpl.TemplateId, Mode: tpl.Mode, Name: tpl.Name, Template: f.Template, Date: f.Date }] : [];
    },
    async liquidFileSet(tpl) { this.calls.push(['set', tpl]); },
    async liquidFileAdd(tpl) { this.calls.push(['add', tpl]); },
    async liquidFileIsValid() { this.calls.push(['isValid']); return true; },
    async liquidFileDelete(tpl) { this.calls.push(['delete', tpl]); },
  };
}

const template = { Id: 42, Name: 'Topaz' };

function makeSession(shop, client) {
  return new SyncSession(shop, template, { client, language: 'pl' });
}

// Świeży, unikalny sklep per test — pliki lokalne żyją na dysku w obrębie pliku
// testowego (jeden LIQUID_FLOW_HOME), więc izolujemy je nazwą sklepu.
let session, client, shop, n = 0;
beforeEach(() => {
  shop = { Id: 1, Name: `TestShop${n++}`, Url: 'http://x', Login: 'webmaster', Password: '' };
  client = fakeClient();
  session = makeSession(shop, client);
});

describe('refreshMismatches — wykrywanie konfliktów', () => {
  it('LocalMissing: plik istnieje zdalnie, brak lokalnie', async () => {
    client.remoteMeta = [{ Mode: 0, Name: 'a.liquid', Date: '2026-01-01T00:00:00' }];
    const list = await session.refreshMismatches({ silent: true });
    expect(list).toHaveLength(1);
    expect(list[0].Type).toBe(MismatchType.LocalMissing);
    expect(list[0].File.Name).toBe('a.liquid');
    expect(list[0].RemoteTs).toBe('2026-01-01T00:00:00');
  });

  it('RemoteMissing: plik istnieje lokalnie, brak zdalnie', async () => {
    store.writeLocalFile(shop.Name, template.Id, 0, 'local-only.liquid', Buffer.from('x'));
    client.remoteMeta = [];
    const list = await session.refreshMismatches({ silent: true });
    expect(list).toHaveLength(1);
    expect(list[0].Type).toBe(MismatchType.RemoteMissing);
    expect(list[0].File.Name).toBe('local-only.liquid');
  });

  it('Timestamp: po obu stronach, ale zdalny znacznik się zmienił', async () => {
    const localts = store.writeLocalFile(shop.Name, template.Id, 0, 'both.liquid', Buffer.from('x'));
    // meta zsynchronizowane z poprzednim zdalnym Date
    store.setMetaEntry(shop.Name, template.Id, 0, 'both.liquid', localts, '2026-01-01T00:00:00');
    // sklep zwraca NOWSZY Date → konflikt timestamp
    client.remoteMeta = [{ Mode: 0, Name: 'both.liquid', Date: '2026-06-01T00:00:00' }];
    const list = await session.refreshMismatches({ silent: true });
    expect(list).toHaveLength(1);
    expect(list[0].Type).toBe(MismatchType.Timestamp);
    expect(list[0].RemoteTs).toBe('2026-06-01T00:00:00');
  });

  it('brak konfliktu, gdy obie strony zsynchronizowane z meta', async () => {
    const localts = store.writeLocalFile(shop.Name, template.Id, 0, 'sync.liquid', Buffer.from('x'));
    store.setMetaEntry(shop.Name, template.Id, 0, 'sync.liquid', localts, '2026-01-01T00:00:00');
    client.remoteMeta = [{ Mode: 0, Name: 'sync.liquid', Date: '2026-01-01T00:00:00' }];
    expect(await session.refreshMismatches({ silent: true })).toEqual([]);
  });
});

describe('_download — pobranie pliku zapisuje dysk i meta', () => {
  it('zapisuje zawartość z bufora i meta z Date', async () => {
    client.remoteFiles['0/new.liquid'] = { Template: Buffer.from('TREŚĆ'), Date: '2026-05-05T00:00:00' };
    await session._download({ Mode: 0, Name: 'new.liquid' });

    const abs = store.localFilePath(shop.Name, template.Id, 0, 'new.liquid');
    expect(fs.readFileSync(abs, 'utf8')).toBe('TREŚĆ');
    const meta = store.loadMeta(shop.Name, template.Id);
    expect(store.getMetaEntry(meta, 0, 'new.liquid').remotets).toBe('2026-05-05T00:00:00');
  });
});

describe('_upload — wysyłka pliku', () => {
  it('istniejący plik (Timestamp) → liquidFileSet i aktualizacja meta', async () => {
    store.writeLocalFile(shop.Name, template.Id, 0, 'up.liquid', Buffer.from('nowa treść'));
    client.remoteMeta = [{ Mode: 0, Name: 'up.liquid', Date: '2026-07-07T00:00:00' }];

    await session._upload({ Mode: 0, Name: 'up.liquid' }, MismatchType.Timestamp);

    expect(client.calls.some(([m]) => m === 'set')).toBe(true);
    const meta = store.loadMeta(shop.Name, template.Id);
    expect(store.getMetaEntry(meta, 0, 'up.liquid').remotets).toBe('2026-07-07T00:00:00');
  });

  it('nowy plik (RemoteMissing) → walidacja + liquidFileAdd', async () => {
    store.writeLocalFile(shop.Name, template.Id, 0, 'add.liquid', Buffer.from('content'));
    client.remoteMeta = [{ Mode: 0, Name: 'add.liquid', Date: '2026-08-08T00:00:00' }];

    await session._upload({ Mode: 0, Name: 'add.liquid' }, MismatchType.RemoteMissing);

    expect(client.calls.some(([m]) => m === 'add')).toBe(true);
    expect(client.calls.some(([m]) => m === 'isValid')).toBe(true);
  });
});
