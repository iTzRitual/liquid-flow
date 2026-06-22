// Silnik synchronizacji jednego szablonu (template) wybranego sklepu.
//
//  - obserwuje katalog lokalny (fs.watch, rekurencyjnie) z debounce 333 ms
//  - przy zapisie pliku natychmiast wysyła go do sklepu (hot-reload)
//  - wykrywa konflikty (lokalny vs zdalny timestamp) i wystawia je do UI
//  - obsługuje komendy: download / upload / removeLocal / removeRemote /
//    downloadAll / uploadAll / refresh

import fs from 'node:fs';
import path from 'node:path';
import { ISklep24Client } from './soap.js';
import * as store from './store.js';
import { logInfo, logOk, logErr } from './log.js';
import { translationsFor } from './translations.js';

const MAX_NAME_LEN = 64;
const MAX_FILE_SIZE = 519168;
const DEBOUNCE_MS = 333;
const IMAGE_EXT = new Set(['.gif', '.jpg', '.jpeg', '.png', '.ico', '.svg']);

export const MismatchType = {
  Timestamp: 'Timestamp',
  LocalMissing: 'LocalMissing',
  RemoteMissing: 'RemoteMissing',
};

function isImage(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

function eq(a, b) {
  return String(a) === String(b);
}
// porównanie znaczników czasu (różne formaty ISO/strefy)
function tsEqual(a, b) {
  if (a == null || b == null) return a == b;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return String(a) === String(b);
  return da === db;
}

export class SyncSession {
  constructor(shop, template, opts = {}) {
    this.shop = shop; // { Id, Name, Url, Login, Password(decrypted), ... }
    this.template = template; // { Id, Name, Locked, Password }
    this.client = opts.client || new ISklep24Client(shop.Url, {
      insecureTLS: !!opts.insecureTLS,
    });
    this.client.setCredentials(shop.Login || 'webmaster', shop.Password || '');
    this.t = translationsFor(opts.language || 'pl');
    this.mismatches = [];
    this.watcher = null;
    this.watcherActive = false;
    this._debounce = new Map(); // path -> timer
    this._queue = Promise.resolve(); // serializacja operacji SOAP
    this.onSynced = opts.onSynced || null; // hook po każdej udanej operacji (np. git)
    this.onMismatchChange = opts.onMismatchChange || null; // hook po przeliczeniu konfliktów
    this.onProgress = opts.onProgress || null; // hook etapów startu (loader w UI)
  }

  get shopName() { return this.shop.Name; }
  get templateId() { return this.template.Id; }

  _progress(p) {
    if (this.onProgress) { try { this.onProgress(p); } catch {} }
  }

  // ---- cykl życia ----
  // Sekwencja startu prezentowana użytkownikowi jako kolejne, jasne kroki:
  //   pobieranie plików (z paskiem postępu) LUB folder już gotowy
  //   → sprawdzanie niezgodności (loader) → synchronizacja aktywna (hot-reload).
  async start() {
    const dir = store.templateDir(this.shopName, this.templateId);
    const fresh = !fs.existsSync(dir) || store.listLocalFiles(this.shopName, this.templateId).length === 0;
    if (fresh) {
      await this._initialDownload();
    } else {
      logOk('Folder lokalny gotowy — pliki już pobrane');
    }

    this._progress({ phase: 'check', state: 'start' });
    await this.refreshMismatches({ silent: true });
    this._progress({ phase: 'check', state: 'done', conflicts: this.mismatches.length });
    logOk('Sprawdzono niezgodności — konflikty: ' + this.mismatches.length);

    this._startWatcher();
    this._progress({ phase: 'ready', template: this.template.Name });
    logOk('Synchronizacja aktywna — hot-reload (' + this.template.Name + ')');
  }

  dispose() {
    this._stopWatcher();
    for (const tm of this._debounce.values()) clearTimeout(tm);
    this._debounce.clear();
    logInfo(this.t.SyncStopped);
  }

  // Pierwsze pobranie wszystkich plików szablonu do katalogu lokalnego.
  // Emituje postęp (start → kolejne pliki → koniec), by UI pokazało pasek 0-100%.
  async _initialDownload() {
    this._progress({ phase: 'download', state: 'start' });
    const files = await this.client.liquidFilesGet({ TemplateId: this.templateId });
    const total = files.length;
    const meta = {};
    let done = 0;
    for (const f of files) {
      const localts = store.writeLocalFile(this.shopName, this.templateId, f.Mode, f.Name, f.Template || Buffer.alloc(0));
      meta[`${f.Mode}/${f.Name}`] = { localts, remotets: f.Date };
      done++;
      if (done === total || done % 5 === 0) {
        this._progress({ phase: 'download', state: 'progress', done, total });
        // ustąp pętli, by UI zdążyło przerysować pasek postępu (inaczej skok 0→100%)
        await new Promise((r) => setImmediate(r));
      }
    }
    store.saveMeta(this.shopName, this.templateId, meta);
    this._progress({ phase: 'download', state: 'done', count: total });
    logOk('Pobrano ' + total + ' plików ze sklepu');
  }

  // ---- watcher ----
  _startWatcher() {
    const dir = store.templateDir(this.shopName, this.templateId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
      this.watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const abs = path.join(dir, filename);
        this._scheduleProcess(abs);
      });
      this.watcherActive = true;
    } catch (e) {
      logErr('Watcher error: ' + e.message);
    }
  }

  _stopWatcher() {
    if (this.watcher) {
      try { this.watcher.close(); } catch {}
      this.watcher = null;
    }
    this.watcherActive = false;
  }

  _scheduleProcess(abs) {
    if (this._debounce.has(abs)) clearTimeout(this._debounce.get(abs));
    this._debounce.set(
      abs,
      setTimeout(() => {
        this._debounce.delete(abs);
        this._enqueue(() => this._processChange(abs)).catch((e) => logErr(e.message));
      }, DEBOUNCE_MS)
    );
  }

  // serializuj operacje SOAP, by uniknąć wyścigów
  _enqueue(fn) {
    this._queue = this._queue.then(fn, fn);
    return this._queue;
  }

  // Reakcja na zmianę pliku lokalnego (hot-reload).
  async _processChange(abs) {
    const parsed = store.parseLocalPath(this.shopName, this.templateId, abs);
    if (!parsed) return;
    const { mode, name } = parsed;
    const exists = fs.existsSync(abs) && fs.statSync(abs).isFile();
    const meta = store.loadMeta(this.shopName, this.templateId);
    const known = !!store.getMetaEntry(meta, mode, name);

    if (!exists) {
      // usunięcie
      if (known) {
        await this.client.liquidFileDelete({ TemplateId: this.templateId, Mode: mode, Name: name });
        store.removeMetaEntry(this.shopName, this.templateId, mode, name);
        logOk(this.t.FileDeleted + ' — ' + this._label(mode, name));
        this._notify('delete', mode, name);
      }
      return;
    }

    const buffer = this._readValidated(abs, name);
    const tpl = { TemplateId: this.templateId, Mode: mode, Name: name, Template: buffer };

    if (known) {
      await this.client.liquidFileSet(tpl);
      logOk(this.t.FileChanged + ' — ' + this._label(mode, name));
    } else {
      const ok = await this.client.liquidFileIsValid({ TemplateId: this.templateId, Mode: mode, Name: name });
      if (!ok) throw new Error(this.t.PathExist);
      await this.client.liquidFileAdd(tpl);
      logOk(this.t.FileCreated + ' — ' + this._label(mode, name));
    }
    // pobierz nowy zdalny timestamp i zapisz meta
    const metaList = await this.client.liquidFilesMetaGet({ TemplateId: this.templateId, Mode: mode, Name: name });
    const remote = metaList[0];
    const localts = store.mtimeUtc(abs);
    store.setMetaEntry(this.shopName, this.templateId, mode, name, localts, remote ? remote.Date : null);
    this._notify(known ? 'change' : 'add', mode, name);
  }

  _readValidated(abs, name) {
    if (name.length > MAX_NAME_LEN) throw new Error(this.t.FilePathTooLong + ' — ' + name);
    const buffer = fs.readFileSync(abs);
    if (buffer.length > MAX_FILE_SIZE) throw new Error(this.t.InvalidFileSize + ' — ' + name);
    if (!isImage(name)) {
      // walidacja: plik tekstowy nie może zawierać znaków sterujących < TAB
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] < 9) throw new Error(this.t.IncorrectFileType + ' — ' + name);
      }
    }
    return buffer;
  }

  _label(mode, name) {
    return `${this.templateId}/${mode}/${name}`;
  }

  _notify(action, mode, name) {
    if (this.onSynced) {
      try { this.onSynced({ action, mode, name, label: this._label(mode, name) }); } catch {}
    }
  }

  // ---- wykrywanie konfliktów ----
  async refreshMismatches(opts = {}) {
    if (!opts.silent) logInfo(this.t.CheckingMismatch);
    const remote = await this.client.liquidFilesMetaGet({ TemplateId: this.templateId });
    const local = store.listLocalFiles(this.shopName, this.templateId);
    const meta = store.loadMeta(this.shopName, this.templateId);

    const remoteByKey = new Map(remote.map((r) => [`${r.Mode}/${r.Name}`, r]));
    const localByKey = new Map(local.map((l) => [`${l.mode}/${l.name}`, l]));
    const result = [];

    // LocalMissing: jest zdalnie, brak lokalnie
    for (const r of remote) {
      if (!localByKey.has(`${r.Mode}/${r.Name}`)) {
        result.push({
          File: { TemplateId: this.templateId, Mode: r.Mode, Name: r.Name },
          Type: MismatchType.LocalMissing,
          FileTs: null,
          LocalTs: null,
          RemoteTs: r.Date,
        });
      }
    }

    // RemoteMissing: jest lokalnie, brak zdalnie
    for (const l of local) {
      if (!remoteByKey.has(`${l.mode}/${l.name}`)) {
        const m = store.getMetaEntry(meta, l.mode, l.name);
        result.push({
          File: { TemplateId: this.templateId, Mode: l.mode, Name: l.name },
          Type: MismatchType.RemoteMissing,
          FileTs: l.fileTs,
          LocalTs: m ? m.localts : null,
          RemoteTs: m ? m.remotets : null,
        });
      }
    }

    // Timestamp: po obu stronach, ale lokalny zmieniony LUB zdalny zmieniony
    for (const l of local) {
      const r = remoteByKey.get(`${l.mode}/${l.name}`);
      if (!r) continue;
      const m = store.getMetaEntry(meta, l.mode, l.name);
      const localChanged = !m || !tsEqual(l.fileTs, m.localts);
      const remoteChanged = !m || !tsEqual(r.Date, m.remotets);
      if (localChanged || remoteChanged) {
        result.push({
          File: { TemplateId: this.templateId, Mode: l.mode, Name: l.name },
          Type: MismatchType.Timestamp,
          FileTs: l.fileTs,
          LocalTs: m ? m.localts : null,
          RemoteTs: m ? m.remotets : null,
        });
      }
    }

    result.sort((a, b) => a.File.Name.localeCompare(b.File.Name));
    this.mismatches = result;
    if (this.onMismatchChange) { try { this.onMismatchChange(result); } catch {} }
    return result;
  }

  // ---- komendy z UI ----
  async command(comm, fileArg, typeArg) {
    return this._enqueue(async () => {
      this._stopWatcher();
      try {
        switch (comm) {
          case 'refr':
          case 'refresh':
            break;
          case 'download':
            await this._download(fileArg);
            break;
          case 'upload':
            await this._upload(fileArg, typeArg);
            break;
          case 'removeLocal':
            await this._removeLocal(fileArg);
            break;
          case 'removeRemote':
            await this._removeRemote(fileArg);
            break;
          case 'downloadAll':
            for (const m of this.mismatches.filter((z) => z.Type === MismatchType.LocalMissing || z.Type === MismatchType.Timestamp)) {
              await this._download(m.File);
            }
            break;
          case 'uploadAll':
            for (const m of this.mismatches.filter((z) => z.Type === MismatchType.RemoteMissing || z.Type === MismatchType.Timestamp)) {
              await this._upload(m.File, m.Type);
            }
            break;
        }
        await this.refreshMismatches();
      } catch (e) {
        logErr(e.message);
        throw e;
      } finally {
        this._startWatcher();
      }
      return this.mismatches;
    });
  }

  // Operacje wywoływane są z command(), które zatrzymuje watcher na czas zapisów,
  // więc nasze własne zapisy lokalne nie wywołają zdarzeń (brak pętli zwrotnej).
  async _download(file) {
    const list = await this.client.liquidFilesGet({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name });
    const f = list[0];
    if (!f) return;
    const localts = store.writeLocalFile(this.shopName, this.templateId, f.Mode, f.Name, f.Template || Buffer.alloc(0));
    store.setMetaEntry(this.shopName, this.templateId, f.Mode, f.Name, localts, f.Date);
    logOk(this.t.Download + ' ✓ — ' + this._label(f.Mode, f.Name));
    this._notify('download', f.Mode, f.Name);
  }

  async _upload(file, type) {
    const abs = store.localFilePath(this.shopName, this.templateId, file.Mode, file.Name);
    const buffer = this._readValidated(abs, file.Name);
    const tpl = { TemplateId: this.templateId, Mode: file.Mode, Name: file.Name, Template: buffer };
    if (type === MismatchType.Timestamp) {
      await this.client.liquidFileSet(tpl);
    } else {
      const ok = await this.client.liquidFileIsValid({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name });
      if (!ok) throw new Error(this.t.PathExist);
      await this.client.liquidFileAdd(tpl);
    }
    const metaList = await this.client.liquidFilesMetaGet({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name });
    const remote = metaList[0];
    store.setMetaEntry(this.shopName, this.templateId, file.Mode, file.Name, store.mtimeUtc(abs), remote ? remote.Date : null);
    logOk(this.t.Upload + ' ✓ — ' + this._label(file.Mode, file.Name));
    this._notify('upload', file.Mode, file.Name);
  }

  async _removeLocal(file) {
    store.deleteLocalFile(this.shopName, this.templateId, file.Mode, file.Name);
    store.removeMetaEntry(this.shopName, this.templateId, file.Mode, file.Name);
    logOk(this.t.FileDeleted + ' (lokalnie) — ' + this._label(file.Mode, file.Name));
    this._notify('removeLocal', file.Mode, file.Name);
  }

  async _removeRemote(file) {
    await this.client.liquidFileDelete({ TemplateId: this.templateId, Mode: file.Mode, Name: file.Name });
    store.removeMetaEntry(this.shopName, this.templateId, file.Mode, file.Name);
    logOk(this.t.FileDeleted + ' (zdalnie) — ' + this._label(file.Mode, file.Name));
    this._notify('removeRemote', file.Mode, file.Name);
  }
}
