// Trwałe przechowywanie konfiguracji, metadanych synchronizacji i plików lokalnych.
// Układ katalogów odwzorowuje oryginał:
//   <dataDir>/Shops/<NazwaSklepu>/files/<TemplateId>/<Mode>/<ścieżka/pliku>
//   <dataDir>/Shops/<NazwaSklepu>/meta/<TemplateId>.json   (localts / remotets)
//   <dataDir>/config.json

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const APP_DIR =
  process.env.LIQUID_SYNC_HOME ||
  path.join(os.homedir(), 'Library', 'Application Support', 'LiquidSyncMac');

const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const KEY_PATH = path.join(APP_DIR, '.key');
const SHOPS_DIR = path.join(APP_DIR, 'Shops');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

ensureDir(APP_DIR);
ensureDir(SHOPS_DIR);

// ---- szyfrowanie haseł (lokalny klucz na maszynie) ----
function getKey() {
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
const DEFAULT_CONFIG = { StartBrowser: true, Port: 45678, Language: 'pl', Shops: [] };

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...cfg, Shops: cfg.Shops || [] };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
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
export function metaDir(shopName) {
  return path.join(shopDir(shopName), 'meta');
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
  const mode = parseInt(rel[0], 10);
  if (Number.isNaN(mode)) return null;
  const name = rel.slice(1).join('/');
  if (!name) return null;
  return { mode, name };
}

export function writeLocalFile(shopName, templateId, mode, name, buffer) {
  const abs = localFilePath(shopName, templateId, mode, name);
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, buffer);
  return mtimeUtc(abs);
}

export function deleteLocalFile(shopName, templateId, mode, name) {
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

export function getMetaEntry(meta, mode, name) {
  return meta[metaKey(mode, name)] || null;
}

export function removeMetaEntry(shopName, templateId, mode, name) {
  const meta = loadMeta(shopName, templateId);
  delete meta[metaKey(mode, name)];
  saveMeta(shopName, templateId, meta);
}

export const paths = { APP_DIR, CONFIG_PATH, SHOPS_DIR };
