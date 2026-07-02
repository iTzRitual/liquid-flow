// Trwałe przechowywanie konfiguracji, metadanych synchronizacji i plików lokalnych.
// Układ katalogów:
//   <dataDir>/Shops/<NazwaSklepu>/files/<TemplateId>/<Mode>/<ścieżka/pliku>
//   <dataDir>/Shops/<NazwaSklepu>/meta/<TemplateId>.json   (localts / remotets)
//   <dataDir>/config.json

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Katalog danych — wieloplatformowy. W aplikacji Electron nadpisywany przez
// LIQUID_FLOW_HOME (= app.getPath('userData')). Domyślne wartości per-OS:
function defaultAppDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'LiquidFlow');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'LiquidFlow');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'liquid-flow');
}

const APP_DIR = process.env.LIQUID_FLOW_HOME || defaultAppDir();

const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const KEY_PATH = path.join(APP_DIR, '.key');
const SHOPS_DIR = path.join(APP_DIR, 'Shops');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Leniwa inicjalizacja — katalogi tworzone przy pierwszym użyciu, nie przy imporcie.
// Dzięki temu sam import store.js nie ma efektów ubocznych (łatwiejsze testowanie).
let _appDirEnsured = false;
function ensureAppDirs() {
  if (_appDirEnsured) return;
  _appDirEnsured = true;
  ensureDir(APP_DIR);
  ensureDir(SHOPS_DIR);
}

// ---- szyfrowanie haseł (lokalny klucz na maszynie) ----
function getKey() {
  ensureAppDirs();
  if (!fs.existsSync(KEY_PATH)) {
    fs.writeFileSync(KEY_PATH, crypto.randomBytes(32));
    try { fs.chmodSync(KEY_PATH, 0o600); } catch {}
  }
  return fs.readFileSync(KEY_PATH);
}

export function encrypt(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'enc:' + iv.toString('base64') + ':' + enc.toString('base64');
}

export function decrypt(stored) {
  if (stored == null || stored === '') return '';
  if (!String(stored).startsWith('enc:')) return stored; // zgodność wstecz
  try {
    const [, ivB64, dataB64] = String(stored).split(':');
    const d = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(ivB64, 'base64'));
    return Buffer.concat([d.update(Buffer.from(dataB64, 'base64')), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// ---- konfiguracja ----
const DEFAULT_CONFIG = { StartBrowser: true, Port: 45678, Language: 'pl', LogWrap: false, HeaderMode: 'auto', Shops: [] };

export function loadConfig() {
  ensureAppDirs();
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...cfg, Shops: cfg.Shops || [] };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  ensureAppDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ---- ścieżki ----
export function shopDir(shopName) {
  return path.join(SHOPS_DIR, shopName);
}
export function filesRoot(shopName) {
  return path.join(shopDir(shopName), 'files');
}
export function templateDir(shopName, templateId) {
  return path.join(filesRoot(shopName), String(templateId));
}
// Folder konkretnego trybu szablonu (np. roboczy '0').
export function templateModeDir(shopName, templateId, mode) {
  return path.join(templateDir(shopName, templateId), String(mode));
}
export function metaDir(shopName) {
  return path.join(shopDir(shopName), 'meta');
}

// Ścieżka gniazda demona (Unix socket / named pipe). Podąża za LIQUID_FLOW_HOME
// przez APP_DIR, więc testy z tmp-home dostają własne gniazdo.
export function daemonSocketPath() {
  if (process.platform === 'win32') {
    return '\\.\pipe\liquidflow-' + crypto.createHash('sha1').update(APP_DIR).digest('hex').slice(0, 16);
  }
  ensureAppDirs();
  return path.join(APP_DIR, 'daemon.sock');
}

// Bezwzględna ścieżka pliku lokalnego dla danego (template, mode, name).
export function localFilePath(shopName, templateId, mode, name) {
  const parts = String(name).split('/').filter((p) => p.length);
  return path.join(templateDir(shopName, templateId), String(mode), ...parts);
}

// Z bezwzględnej ścieżki (wewnątrz templateDir) wyznacz {mode, name}.
export function parseLocalPath(shopName, templateId, absPath) {
  const root = templateDir(shopName, templateId);
  const rel = path.relative(root, absPath).split(path.sep);
  if (rel.length < 2 || rel[0].startsWith('..')) return null;
  // Pomiń pliki/foldery zaczynające się od kropki (np. .git, .DS_Store) —
  // nie są synchronizowane z e-Sklep. Dzięki temu repo git może żyć w trybie '0'.
  if (rel.some((seg) => seg.startsWith('.'))) return null;
  const mode = parseInt(rel[0], 10);
  if (Number.isNaN(mode)) return null;
  const name = rel.slice(1).join('/');
  if (!name) return null;
  return { mode, name };
}

// Czy nazwa pliku (pochodzi z odpowiedzi SOAP sklepu — NIEZAUFANA) trzyma się
// wewnątrz katalogu trybu szablonu? Odrzuca puste nazwy, NUL, separatory
// Windows ('\\') oraz segmenty '.'/'..', czyli wszystko, czym path.join mógłby
// uciec poza katalog danych (path traversal). Strona zapisu nie miała takiej
// bramki (czytająca parseLocalPath miała) — to jest ta bramka.
export function isSafeRelName(name) {
  const s = String(name);
  if (!s || s.includes('\0') || s.includes('\\')) return false;
  const parts = s.split('/').filter((p) => p.length);
  if (!parts.length) return false;
  return !parts.some((p) => p === '.' || p === '..');
}

export function writeLocalFile(shopName, templateId, mode, name, buffer) {
  if (!isSafeRelName(name)) throw new Error(`Unsafe file path rejected: ${name}`);
  const abs = localFilePath(shopName, templateId, mode, name);
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, buffer);
  return mtimeUtc(abs);
}

export function deleteLocalFile(shopName, templateId, mode, name) {
  if (!isSafeRelName(name)) return;
  const abs = localFilePath(shopName, templateId, mode, name);
  try { fs.unlinkSync(abs); } catch {}
}

export function mtimeUtc(absPath) {
  try {
    return fs.statSync(absPath).mtime.toISOString();
  } catch {
    return null;
  }
}

// Wszystkie lokalne pliki danego template jako [{mode, name, fileTs, path}]
export function listLocalFiles(shopName, templateId) {
  const root = templateDir(shopName, templateId);
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && !e.name.startsWith('.')) {
        const p = parseLocalPath(shopName, templateId, full);
        if (p) out.push({ ...p, fileTs: mtimeUtc(full), path: full });
      }
    }
  }
  walk(root);
  return out;
}

// ---- metadane synchronizacji (localts / remotets) ----
function metaPath(shopName, templateId) {
  return path.join(metaDir(shopName), `${templateId}.json`);
}
function metaKey(mode, name) {
  return `${mode}/${name}`;
}

export function loadMeta(shopName, templateId) {
  const p = metaPath(shopName, templateId);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

export function saveMeta(shopName, templateId, meta) {
  ensureDir(metaDir(shopName));
  fs.writeFileSync(metaPath(shopName, templateId), JSON.stringify(meta, null, 2));
}

export function setMetaEntry(shopName, templateId, mode, name, localts, remotets) {
  const meta = loadMeta(shopName, templateId);
  meta[metaKey(mode, name)] = { localts, remotets };
  saveMeta(shopName, templateId, meta);
}

// Ustaw wpis w PRZEKAZANYM obiekcie meta (bez odczytu/zapisu dysku). Do
// masowego pobierania: akumuluj w pamięci i flushuj przez saveMeta co paczkę,
// zamiast read+write na każdy plik (O(n²) synchronicznych operacji I/O, które
// blokują pętlę zdarzeń — zauważalne np. na Windows z aktywnym antywirusem).
export function setMetaEntryOn(meta, mode, name, localts, remotets) {
  meta[metaKey(mode, name)] = { localts, remotets };
  return meta;
}

export function getMetaEntry(meta, mode, name) {
  return meta[metaKey(mode, name)] || null;
}

export function removeMetaEntry(shopName, templateId, mode, name) {
  const meta = loadMeta(shopName, templateId);
  delete meta[metaKey(mode, name)];
  saveMeta(shopName, templateId, meta);
}

// ---- trwała historia logu per-szablon ----
// Każdy szablon ma własny plik historii (JSON-per-linia), dzięki czemu po
// powrocie do szablonu wczytujemy „poprzednią sesję". Plik żyje poza
// `files/<id>/` (w `Shops/<Nazwa>/logs/`), więc nie trafia do synchronizacji
// ani do repo git szablonu.
export function logsDir(shopName) {
  return path.join(shopDir(shopName), 'logs');
}
function logPath(shopName, templateId) {
  return path.join(logsDir(shopName), `${templateId}.jsonl`);
}
const LOG_MAX_LINES = 1000;

// Dopisz jeden wpis logu do pliku historii szablonu.
export function appendLogEntry(shopName, templateId, entry) {
  try {
    ensureDir(logsDir(shopName));
    // Zapisujemy też deskryptor i18n (msg/params lub sepKey/sepTs), żeby po
    // ponownym wczytaniu historię dało się wyrenderować w bieżącym języku.
    // `Text` zostaje jako wartość zapasowa (literały, stare pliki).
    const line = JSON.stringify({
      TS: entry.TS, Text: entry.Text, Color: entry.Color, kind: entry.kind,
      msg: entry.msg, params: entry.params, sepKey: entry.sepKey, sepTs: entry.sepTs,
    }) + '\n';
    fs.appendFileSync(logPath(shopName, templateId), line);
  } catch {}
}

// Wczytaj końcówkę historii (ostatnie `n` wpisów) jako [{TS,Text,Color,kind}].
// Przy okazji przycina plik, gdy urósł ponad LOG_MAX_LINES.
export function readLogTail(shopName, templateId, n = 300) {
  const p = logPath(shopName, templateId);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return []; }
  const lines = raw.split('\n').filter((l) => l.trim().length);
  if (lines.length > LOG_MAX_LINES) {
    const trimmed = lines.slice(-LOG_MAX_LINES);
    try { fs.writeFileSync(p, trimmed.join('\n') + '\n'); } catch {}
  }
  const out = [];
  for (const l of lines.slice(-n)) {
    try { out.push(JSON.parse(l)); } catch {}
  }
  return out;
}

// Usuń cały katalog sklepu z dysku (pliki, meta, logi, repo git).
// Wywoływane przy removeShop — zapobiega osierocaniu danych.
export function deleteShopDir(shopName) {
  const d = shopDir(shopName);
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

export const paths = { APP_DIR, CONFIG_PATH, SHOPS_DIR };
