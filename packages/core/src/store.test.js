import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as store from './store.js';
import { defaultAppDir } from './store.js';

// Każdy test używa innej nazwy sklepu, więc współdzielą jeden LIQUID_FLOW_HOME
// (ustawiony w setupFile) bez wzajemnych kolizji.
let shop;
let n = 0;
beforeEach(() => { shop = `Sklep${n++}`; });

describe('encrypt / decrypt', () => {
  it('roundtrip zwraca oryginalny tekst', () => {
    const enc = store.encrypt('tajne-haslo-123');
    expect(enc).toMatch(/^enc:/);
    expect(enc).not.toContain('tajne');
    expect(store.decrypt(enc)).toBe('tajne-haslo-123');
  });

  it('puste wejście → pusty string (bez szyfrowania)', () => {
    expect(store.encrypt('')).toBe('');
    expect(store.encrypt(null)).toBe('');
    expect(store.decrypt('')).toBe('');
  });

  it('zgodność wstecz: wartość bez prefiksu enc: zwracana jak jest', () => {
    expect(store.decrypt('plaintext-legacy')).toBe('plaintext-legacy');
  });

  it('uszkodzony szyfrogram → pusty string (nie rzuca)', () => {
    expect(store.decrypt('enc:abc:def')).toBe('');
  });
});

describe('parseLocalPath', () => {
  it('wyłuskuje { mode, name } z głębokiej ścieżki', () => {
    const abs = store.localFilePath(shop, 5, 0, 'snippets/foo.liquid');
    expect(store.parseLocalPath(shop, 5, abs)).toEqual({ mode: 0, name: 'snippets/foo.liquid' });
  });

  it('pomija ścieżki z kropką (.git, .DS_Store) → null', () => {
    const root = store.templateDir(shop, 5);
    expect(store.parseLocalPath(shop, 5, path.join(root, '0', '.git', 'HEAD'))).toBeNull();
    expect(store.parseLocalPath(shop, 5, path.join(root, '0', '.DS_Store'))).toBeNull();
  });

  it('odrzuca ścieżki poza katalogiem szablonu', () => {
    expect(store.parseLocalPath(shop, 5, '/etc/passwd')).toBeNull();
  });

  it('odrzuca brak trybu lub niemumeryczny tryb', () => {
    const root = store.templateDir(shop, 5);
    expect(store.parseLocalPath(shop, 5, path.join(root, 'plik.liquid'))).toBeNull();
    expect(store.parseLocalPath(shop, 5, path.join(root, 'x', 'plik.liquid'))).toBeNull();
  });
});

describe('isSafeRelName / ochrona przed path traversal (zapis)', () => {
  it('przepuszcza zwykłe zagnieżdżone nazwy', () => {
    expect(store.isSafeRelName('snippets/foo.liquid')).toBe(true);
    expect(store.isSafeRelName('a/b/c.liquid')).toBe(true);
  });

  it('odrzuca segmenty ../. , separatory Windows i puste/NUL', () => {
    expect(store.isSafeRelName('../evil')).toBe(false);
    expect(store.isSafeRelName('a/../../b')).toBe(false);
    expect(store.isSafeRelName('..')).toBe(false);
    expect(store.isSafeRelName('a\\b')).toBe(false);
    expect(store.isSafeRelName('')).toBe(false);
    expect(store.isSafeRelName('a\0b')).toBe(false);
  });

  it('writeLocalFile rzuca i NIE pisze pliku poza katalogiem szablonu', () => {
    const escaped = path.join(store.templateModeDir(shop, 5, 0), '..', '..', 'escape.txt');
    expect(() => store.writeLocalFile(shop, 5, 0, '../../escape.txt', Buffer.from('x'))).toThrow();
    expect(fs.existsSync(escaped)).toBe(false);
  });
});

describe('config', () => {
  // config.json ma STAŁĄ ścieżkę (nie zależy od nazwy sklepu), więc w obrębie
  // pliku testy konfiguracji dzielą jeden plik. Czyścimy go przed każdym, by
  // 'brak pliku' nie zależał od kolejności (np. pod `--sequence.shuffle`).
  beforeEach(() => { try { fs.rmSync(store.paths.CONFIG_PATH); } catch {} });

  it('domyślna konfiguracja gdy brak pliku', () => {
    const cfg = store.loadConfig();
    expect(cfg.Language).toBe('pl');
    expect(cfg.Shops).toEqual([]);
    expect(cfg.Port).toBe(45678);
  });

  it('save/load roundtrip z domyślkami dla brakujących pól', () => {
    store.saveConfig({ Language: 'en', Shops: [{ Id: 1, Name: 'A' }] });
    const cfg = store.loadConfig();
    expect(cfg.Language).toBe('en');
    expect(cfg.Shops).toHaveLength(1);
    expect(cfg.StartBrowser).toBe(true); // dopełnione z DEFAULT_CONFIG
  });
});

describe('pliki lokalne + meta', () => {
  it('write/list zwraca wpis z mode/name/ts; pomija dotfiles', () => {
    store.writeLocalFile(shop, 9, 0, 'a/b.liquid', Buffer.from('x'));
    store.writeLocalFile(shop, 9, 2, 'c.liquid', Buffer.from('y'));
    // plik kropkowy nie powinien się pojawić na liście
    fs.writeFileSync(path.join(store.templateModeDir(shop, 9, 0), '.hidden'), 'z');

    const files = store.listLocalFiles(shop, 9).sort((a, b) => a.name.localeCompare(b.name));
    expect(files.map((f) => `${f.mode}/${f.name}`)).toEqual(['0/a/b.liquid', '2/c.liquid']);
    expect(files[0].fileTs).toBeTruthy();
  });

  it('setMetaEntry / getMetaEntry / removeMetaEntry', () => {
    store.setMetaEntry(shop, 9, 0, 'a.liquid', 'L1', 'R1');
    let meta = store.loadMeta(shop, 9);
    expect(store.getMetaEntry(meta, 0, 'a.liquid')).toEqual({ localts: 'L1', remotets: 'R1' });

    store.removeMetaEntry(shop, 9, 0, 'a.liquid');
    meta = store.loadMeta(shop, 9);
    expect(store.getMetaEntry(meta, 0, 'a.liquid')).toBeNull();
  });

  it('deleteLocalFile usuwa plik z dysku', () => {
    store.writeLocalFile(shop, 9, 0, 'del.liquid', Buffer.from('x'));
    const abs = store.localFilePath(shop, 9, 0, 'del.liquid');
    expect(fs.existsSync(abs)).toBe(true);
    store.deleteLocalFile(shop, 9, 0, 'del.liquid');
    expect(fs.existsSync(abs)).toBe(false);
  });
});

describe('trwała historia logu (jsonl)', () => {
  it('append + readLogTail zachowuje deskryptor i18n', () => {
    store.appendLogEntry(shop, 3, { TS: 't1', Text: 'Połączono', Color: '#2A2', msg: 'ConnectedToShop', params: { name: 'A' } });
    const tail = store.readLogTail(shop, 3);
    expect(tail).toHaveLength(1);
    expect(tail[0]).toMatchObject({ Text: 'Połączono', msg: 'ConnectedToShop', params: { name: 'A' } });
  });

  it('readLogTail z limitem zwraca tylko ostatnie n', () => {
    for (let i = 0; i < 10; i++) store.appendLogEntry(shop, 4, { TS: `t${i}`, Text: `e${i}`, Color: '#666' });
    const tail = store.readLogTail(shop, 4, 3);
    expect(tail.map((e) => e.Text)).toEqual(['e7', 'e8', 'e9']);
  });
});

describe('defaultAppDir', () => {
  it('ignores LIQUID_FLOW_HOME and returns the canonical per-OS dir', () => {
    const before = process.env.LIQUID_FLOW_HOME;
    process.env.LIQUID_FLOW_HOME = '/tmp/some/override';
    try {
      const dir = defaultAppDir();
      expect(dir).not.toBe('/tmp/some/override');
      const leaf = path.basename(dir);
      // macOS/Windows → 'LiquidFlow'; Linux → 'liquid-flow'
      expect(['LiquidFlow', 'liquid-flow']).toContain(leaf);
    } finally {
      if (before === undefined) delete process.env.LIQUID_FLOW_HOME;
      else process.env.LIQUID_FLOW_HOME = before;
    }
  });
});
