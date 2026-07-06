import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SyncSession, MismatchType } from './syncEngine.js';
import * as store from './store.js';

// A fake SOAP client with a call log and controllable remote state.
function fakeClient() {
  return {
    calls: [],
    remoteMeta: [],            // [{ Mode, Name, Date }]
    files: [],                 // liquidFilesGet → [{ Mode, Name, Template, Date }]
    valid: true,               // liquidFileIsValid
    setCredentials() {},
    async liquidFilesGet() { this.calls.push(['get']); return this.files; },
    async liquidFilesMetaGet(tpl) {
      this.calls.push(['meta', tpl?.Name]);
      if (tpl && tpl.Name != null) return this.remoteMeta.filter((r) => r.Mode === tpl.Mode && r.Name === tpl.Name);
      return this.remoteMeta;
    },
    async liquidFileSet(t) { this.calls.push(['set', t.Name]); },
    async liquidFileAdd(t) { this.calls.push(['add', t.Name]); },
    async liquidFileIsValid() { this.calls.push(['isValid']); return this.valid; },
    async liquidFileDelete(t) { this.calls.push(['delete', t.Name]); },
  };
}

const template = { Id: 7, Name: 'Topaz' };
let shop, client, session, synced, progress, n = 0;
beforeEach(() => {
  shop = { Id: 1, Name: `WatchShop${n++}`, Url: 'http://x', Login: 'webmaster', Password: '' };
  client = fakeClient();
  synced = [];
  progress = [];
  session = new SyncSession(shop, template, {
    client, language: 'pl',
    onSynced: (e) => synced.push(e),
    onProgress: (p) => progress.push(p),
  });
});
afterEach(() => { try { session.dispose(); } catch {} });

const writeLocal = (mode, name, content) =>
  store.writeLocalFile(shop.Name, template.Id, mode, name, Buffer.from(content));

describe('_processChange — hot-reload zmian lokalnych', () => {
  it('zmiana znanego pliku → liquidFileSet + aktualizacja meta + onSynced(change)', async () => {
    const ts = writeLocal(0, 'a.liquid', 'nowa treść');
    store.setMetaEntry(shop.Name, template.Id, 0, 'a.liquid', ts, '2026-01-01T00:00:00');
    client.remoteMeta = [{ Mode: 0, Name: 'a.liquid', Date: '2026-06-06T00:00:00' }];

    await session._processChange(store.localFilePath(shop.Name, template.Id, 0, 'a.liquid'));

    expect(client.calls.some(([m, n]) => m === 'set' && n === 'a.liquid')).toBe(true);
    expect(client.calls.some(([m]) => m === 'add')).toBe(false);
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, 'a.liquid').remotets).toBe('2026-06-06T00:00:00');
    expect(synced.at(-1)).toMatchObject({ action: 'change', name: 'a.liquid' });
  });

  it('nowy plik → walidacja + liquidFileAdd + onSynced(add)', async () => {
    writeLocal(0, 'new.liquid', 'treść');
    client.remoteMeta = [{ Mode: 0, Name: 'new.liquid', Date: '2026-02-02T00:00:00' }];

    await session._processChange(store.localFilePath(shop.Name, template.Id, 0, 'new.liquid'));

    expect(client.calls.some(([m]) => m === 'isValid')).toBe(true);
    expect(client.calls.some(([m, n]) => m === 'add' && n === 'new.liquid')).toBe(true);
    expect(synced.at(-1)).toMatchObject({ action: 'add', name: 'new.liquid' });
  });

  it('nowy plik, ale ścieżka zajęta (isValid=false) → rzuca', async () => {
    writeLocal(0, 'busy.liquid', 'x');
    client.valid = false;
    await expect(session._processChange(store.localFilePath(shop.Name, template.Id, 0, 'busy.liquid'))).rejects.toThrow();
    expect(client.calls.some(([m]) => m === 'add')).toBe(false);
  });

  it('usunięcie znanego pliku → liquidFileDelete + usunięcie meta + onSynced(delete)', async () => {
    const ts = writeLocal(0, 'del.liquid', 'x');
    store.setMetaEntry(shop.Name, template.Id, 0, 'del.liquid', ts, '2026-01-01T00:00:00');
    const abs = store.localFilePath(shop.Name, template.Id, 0, 'del.liquid');
    fs.unlinkSync(abs);

    await session._processChange(abs);

    expect(client.calls.some(([m, n]) => m === 'delete' && n === 'del.liquid')).toBe(true);
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, 'del.liquid')).toBeNull();
    expect(synced.at(-1)).toMatchObject({ action: 'delete', name: 'del.liquid' });
  });

  it('zmiana poza katalogiem szablonu (parseLocalPath=null) → ignorowana', async () => {
    await session._processChange('/etc/hosts');
    expect(client.calls).toHaveLength(0);
  });
});

describe('_readValidated — limity i walidacja plików', () => {
  it('plik tekstowy ze znakiem sterującym (<TAB) → rzuca', () => {
    writeLocal(0, 'ctrl.liquid', 'ok\x01zły');
    const abs = store.localFilePath(shop.Name, template.Id, 0, 'ctrl.liquid');
    expect(() => session._readValidated(abs, 'ctrl.liquid')).toThrow();
  });

  it('obraz z bajtami binarnymi → OK (walidacja tekstu pomijana)', () => {
    writeLocal(0, 'logo.png', '\x00\x01\x02');
    const abs = store.localFilePath(shop.Name, template.Id, 0, 'logo.png');
    expect(() => session._readValidated(abs, 'logo.png')).not.toThrow();
  });
});

describe('_initialDownload — pierwsze pobranie', () => {
  it('zapisuje pliki, meta i emituje postęp + log', async () => {
    client.files = [
      { Mode: 0, Name: 'a.liquid', Template: Buffer.from('AAA'), Date: '2026-01-01T00:00:00' },
      { Mode: 2, Name: 'b.liquid', Template: Buffer.from('BBB'), Date: '2026-02-02T00:00:00' },
    ];
    await session._initialDownload();

    expect(fs.readFileSync(store.localFilePath(shop.Name, template.Id, 0, 'a.liquid'), 'utf8')).toBe('AAA');
    expect(fs.readFileSync(store.localFilePath(shop.Name, template.Id, 2, 'b.liquid'), 'utf8')).toBe('BBB');
    const meta = store.loadMeta(shop.Name, template.Id);
    expect(store.getMetaEntry(meta, 0, 'a.liquid').remotets).toBe('2026-01-01T00:00:00');
    // progress: start … done
    expect(progress.some((p) => p.phase === 'download' && p.state === 'start')).toBe(true);
    expect(progress.some((p) => p.phase === 'download' && p.state === 'done')).toBe(true);
  });

  it('odrzuca plik o niebezpiecznej nazwie (path traversal) — nie pisze poza katalog', async () => {
    client.files = [
      { Mode: 0, Name: '../../escape.liquid', Template: Buffer.from('EVIL'), Date: '2026-01-01T00:00:00' },
      { Mode: 0, Name: 'ok.liquid', Template: Buffer.from('OK'), Date: '2026-01-01T00:00:00' },
    ];
    await session._initialDownload();

    // the safe file was written
    expect(fs.existsSync(store.localFilePath(shop.Name, template.Id, 0, 'ok.liquid'))).toBe(true);
    // the malicious file did NOT escape the directory
    const escaped = path.join(store.templateModeDir(shop.Name, template.Id, 0), '..', '..', 'escape.liquid');
    expect(fs.existsSync(escaped)).toBe(false);
    // no meta for the malicious entry
    expect(store.getMetaEntry(store.loadMeta(shop.Name, template.Id), 0, '../../escape.liquid')).toBeNull();
  });

  it('przerwane pobieranie zostawia meta dla już zapisanych plików (przyrostowo)', async () => {
    // The file 'b.liquid' is unwritable: in its place we create a DIRECTORY, so
    // fs.writeFileSync throws EISDIR mid-loop. This simulates a failure in the
    // middle of the download. 'a.liquid' (processed earlier) should have meta.
    client.files = [
      { Mode: 0, Name: 'a.liquid', Template: Buffer.from('A'), Date: '2026-01-01T00:00:00' },
      { Mode: 0, Name: 'b.liquid', Template: Buffer.from('B'), Date: '2026-01-02T00:00:00' },
      { Mode: 0, Name: 'c.liquid', Template: Buffer.from('C'), Date: '2026-01-03T00:00:00' },
    ];
    // Create a directory exactly where the file 'b.liquid' would be written.
    const bPath = store.localFilePath(shop.Name, template.Id, 0, 'b.liquid');
    fs.mkdirSync(bPath, { recursive: true });

    await expect(session._initialDownload()).rejects.toThrow();

    const meta = store.loadMeta(shop.Name, template.Id);
    // file 'a' processed before the failure → meta saved incrementally
    expect(store.getMetaEntry(meta, 0, 'a.liquid')).toMatchObject({ remotets: '2026-01-01T00:00:00' });
    // 'b'/'c' did not make it → no meta
    expect(store.getMetaEntry(meta, 0, 'b.liquid')).toBeNull();
    expect(store.getMetaEntry(meta, 0, 'c.liquid')).toBeNull();
  });
});

describe('cykl życia start()/dispose()', () => {
  it('start: pobiera (świeży), sprawdza konflikty, uruchamia watcher; dispose sprząta', async () => {
    client.files = [{ Mode: 0, Name: 'a.liquid', Template: Buffer.from('x'), Date: '2026-01-01T00:00:00' }];
    client.remoteMeta = [{ Mode: 0, Name: 'a.liquid', Date: '2026-01-01T00:00:00' }];

    await session.start();
    expect(session.watcherActive).toBe(true);
    // the progress phases presented to the user
    expect(progress.some((p) => p.phase === 'check')).toBe(true);
    expect(progress.some((p) => p.phase === 'ready')).toBe(true);

    session.dispose();
    expect(session.watcherActive).toBe(false);
    expect(session.watcher).toBeNull();
  });

  it('withWatcherPaused wstrzymuje watcher i wywołuje refreshMismatches', async () => {
    await session.start();
    expect(session.watcherActive).toBe(true);

    const spy = vi.spyOn(session, 'refreshMismatches');

    let insideFn = false;
    await session.withWatcherPaused(async () => {
      insideFn = true;
      expect(session.watcherActive).toBe(false);
    });

    expect(insideFn).toBe(true);
    expect(session.watcherActive).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // even on throw, watcher should restart
    try {
      await session.withWatcherPaused(async () => {
        expect(session.watcherActive).toBe(false);
        throw new Error('test-err');
      });
    } catch (e) {
      expect(e.message).toBe('test-err');
    }
    expect(session.watcherActive).toBe(true);
  });
});

describe('runExclusive — serializacja na kolejce sesji', () => {
  it('dwa równoległe runExclusive nie przeplatają się; watcher nie jest zatrzymywany', async () => {
    // Start the session so the watcher is active.
    client.files = [{ Mode: 0, Name: 'a.liquid', Template: Buffer.from('x'), Date: '2026-01-01T00:00:00' }];
    client.remoteMeta = [{ Mode: 0, Name: 'a.liquid', Date: '2026-01-01T00:00:00' }];
    await session.start();
    expect(session.watcherActive).toBe(true);

    const order = [];
    const fn1 = async () => {
      order.push('s1');
      await new Promise(r => setImmediate(r));
      order.push('e1');
    };
    const fn2 = async () => {
      order.push('s2');
      await new Promise(r => setImmediate(r));
      order.push('e2');
    };

    // Run both at once — they must be handled sequentially (the queue).
    await Promise.all([session.runExclusive(fn1), session.runExclusive(fn2)]);

    // Strictly sequential order: s1→e1→s2→e2 (never s1→s2→e1→e2).
    expect(order).toEqual(['s1', 'e1', 's2', 'e2']);
    // runExclusive does NOT stop the watcher — the watcher must keep running.
    expect(session.watcherActive).toBe(true);
  });
});

describe('_pollRefresh — wykrywanie zmian zdalnych', () => {
  it('przyrost konfliktów po stronie sklepu jest wychwytywany', async () => {
    // start with no conflicts
    client.remoteMeta = [];
    await session.refreshMismatches({ silent: true });
    expect(session.mismatches).toHaveLength(0);

    // the shop added a file → the poll detects a new conflict (LocalMissing)
    client.remoteMeta = [{ Mode: 0, Name: 'remote-new.liquid', Date: '2026-03-03T00:00:00' }];
    await session._pollRefresh();
    expect(session.mismatches).toHaveLength(1);
    expect(session.mismatches[0].Type).toBe(MismatchType.LocalMissing);
  });
});
