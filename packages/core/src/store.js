// Persistent storage of configuration, synchronization metadata and local files.
// Directory layout:
//   <dataDir>/Shops/<ShopName>/files/<TemplateId>/<Mode>/<file/path>
//   <dataDir>/Shops/<ShopName>/meta/<TemplateId>.json   (localts / remotets)
//   <dataDir>/config.json

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Data directory — cross-platform. In the Electron app it is overridden by
// LIQUID_FLOW_HOME (= app.getPath('userData')). Per-OS defaults:
export function defaultAppDir() {
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

// Lazy initialization — directories are created on first use, not on import.
// This keeps importing store.js side-effect-free (easier to test).
let _appDirEnsured = false;
function ensureAppDirs() {
  if (_appDirEnsured) return;
  _appDirEnsured = true;
  ensureDir(APP_DIR);
  ensureDir(SHOPS_DIR);
}

// ---- password encryption (local per-machine key) ----
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
  if (!String(stored).startsWith('enc:')) return stored; // backward compatibility
  try {
    const [, ivB64, dataB64] = String(stored).split(':');
    const d = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(ivB64, 'base64'));
    return Buffer.concat([d.update(Buffer.from(dataB64, 'base64')), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// ---- configuration ----
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

// ---- paths ----
export function shopDir(shopName) {
  return path.join(SHOPS_DIR, shopName);
}
export function filesRoot(shopName) {
  return path.join(shopDir(shopName), 'files');
}
export function templateDir(shopName, templateId) {
  return path.join(filesRoot(shopName), String(templateId));
}
// Folder of a specific template mode (e.g. working mode '0').
export function templateModeDir(shopName, templateId, mode) {
  return path.join(templateDir(shopName, templateId), String(mode));
}
export function metaDir(shopName) {
  return path.join(shopDir(shopName), 'meta');
}

// Daemon socket path (Unix socket / named pipe). Follows LIQUID_FLOW_HOME via
// APP_DIR, so tests with a tmp-home get their own socket.
export function daemonSocketPath() {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\liquidflow-' + crypto.createHash('sha1').update(APP_DIR).digest('hex').slice(0, 16);
  }
  ensureAppDirs();
  return path.join(APP_DIR, 'daemon.sock');
}

// Absolute path of the local file for a given (template, mode, name).
export function localFilePath(shopName, templateId, mode, name) {
  const parts = String(name).split('/').filter((p) => p.length);
  return path.join(templateDir(shopName, templateId), String(mode), ...parts);
}

// Derive {mode, name} from an absolute path (inside templateDir).
export function parseLocalPath(shopName, templateId, absPath) {
  const root = templateDir(shopName, templateId);
  const rel = path.relative(root, absPath).split(path.sep);
  if (rel.length < 2 || rel[0].startsWith('..')) return null;
  // Skip files/folders starting with a dot (e.g. .git, .DS_Store) — they are not
  // synchronized to e-Sklep. This lets the git repo live inside mode '0'.
  if (rel.some((seg) => seg.startsWith('.'))) return null;
  const mode = parseInt(rel[0], 10);
  if (Number.isNaN(mode)) return null;
  const name = rel.slice(1).join('/');
  if (!name) return null;
  return { mode, name };
}

// Does a file name (coming from the shop's SOAP response — UNTRUSTED) stay inside
// the template mode directory? Rejects empty names, NUL, Windows separators ('\\')
// and '.'/'..' segments — anything that path.join could use to escape the data
// directory (path traversal). The write side had no such gate (the reading
// parseLocalPath did) — this is that gate.
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

// All local files of a given template as [{mode, name, fileTs, path}]
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

// ---- synchronization metadata (localts / remotets) ----
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

// Set an entry in the PASSED meta object (no disk read/write). For bulk downloads:
// accumulate in memory and flush via saveMeta per batch, instead of a read+write
// per file (O(n²) synchronous I/O operations that block the event loop — noticeable
// e.g. on Windows with active antivirus).
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

// ---- persistent per-template log history ----
// Each template has its own history file (JSON-per-line), so returning to a
// template loads the "previous session". The file lives outside `files/<id>/`
// (in `Shops/<Name>/logs/`), so it is not synchronized nor added to the template's
// git repo.
export function logsDir(shopName) {
  return path.join(shopDir(shopName), 'logs');
}
function logPath(shopName, templateId) {
  return path.join(logsDir(shopName), `${templateId}.jsonl`);
}
const LOG_MAX_LINES = 1000;

// Append a single log entry to the template's history file.
export function appendLogEntry(shopName, templateId, entry) {
  try {
    ensureDir(logsDir(shopName));
    // Also store the i18n descriptor (msg/params or sepKey/sepTs) so that, once
    // reloaded, the history can be rendered in the current language.
    // `Text` remains as a fallback value (literals, older files).
    const line = JSON.stringify({
      TS: entry.TS, Text: entry.Text, Color: entry.Color, kind: entry.kind,
      msg: entry.msg, params: entry.params, sepKey: entry.sepKey, sepTs: entry.sepTs,
    }) + '\n';
    fs.appendFileSync(logPath(shopName, templateId), line);
  } catch {}
}

// Load the tail of the history (the last `n` entries) as [{TS,Text,Color,kind}].
// It also trims the file when it has grown past LOG_MAX_LINES.
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

// Remove the entire shop directory from disk (files, meta, logs, git repo).
// Called on removeShop — prevents orphaning data.
export function deleteShopDir(shopName) {
  const d = shopDir(shopName);
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

export const paths = { APP_DIR, CONFIG_PATH, SHOPS_DIR };
