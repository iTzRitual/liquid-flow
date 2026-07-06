// Buffer of synchronization event log entries — split into channels (scope).
//
// At any moment exactly one channel is active (because only one synchronization
// session is active at a time). Producers still call logInfo/logOk/logErr without
// knowing about channels — the entry goes to the current channel. The Controller
// switches the channel on shop connect / template select / disconnect:
//   'app'                  — before connecting (ephemeral)
//   'shop:<id>'            — connected shop, no template (ephemeral)
//   'tpl:<shopId>:<tplId>' — active template (PERSISTENT: persisted to a file)
//
// Entry: { Id, TS, Text, Color, kind?, historic?, msg?, params?, sepKey?, sepTs? }.
//  - kind:'separator'  — a divider line (e.g. a session boundary),
//  - historic:true     — an entry loaded from a previous session (rendered dimmed),
//  - msg + params      — i18n DESCRIPTOR: translation key + parameters for `tfmt`.
//    `Text` is rendered from the descriptor for the CURRENT language. This lets
//    `setLanguage` re-render the whole visible log (and loaded history) in the new
//    language. Entries without `msg` (literals: raw errors/stderr) are left as-is.
//  - sepKey + sepTs    — descriptor variant for a separator (key + timestamp).

import { EventEmitter } from 'node:events';
import { translationsFor, tfmt, localeFor } from './translations.js';

export const COLORS = {
  red: '#F00',    // error
  gray: '#666',   // info
  green: '#2A2',  // success
  white: '#FFF',  // default
  sep: '#82bbff', // separator (matches Divider)
};

const MAX = 1000;
const waiters = new Set(); // long-poll: { lastId, resolve }

// Current log rendering language. Changed by Controller.setLanguage.
let lang = 'pl';

// Event emitter: 'entry' on every new entry (a push for the UI),
// 'reset' on channel switch / language change (full buffer replacement).
export const events = new EventEmitter();
events.setMaxListeners(50);

// Helper for producers: build an i18n descriptor `{ msg, params }`.
// Usage: logOk(tmsg('ConnectedToShop', { name })).
export function tmsg(key, params = {}) {
  return { msg: key, params };
}

// Flatten an entry's text to a SINGLE line — raw git stderr is sometimes multi-line,
// and LogPane counts 1 entry = 1 row; an embedded \n blows the budget (frame duplication).
function oneLine(s) {
  return String(s).replace(/[\t\f\v]+/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ⏎ ').trim();
}

// Render an entry's `Text` for the current language.
function renderText(e) {
  if (e.kind === 'separator') {
    if (!e.sepKey) return e.Text || '';
    const label = translationsFor(lang)[e.sepKey] || e.sepKey;
    const when = e.sepTs ? ' • ' + new Date(e.sepTs).toLocaleString(localeFor(lang), { hour12: false }) : '';
    return label + when;
  }
  if (e.msg) return oneLine(tfmt(translationsFor(lang)[e.msg] || e.msg, e.params || {}));
  return oneLine(e.Text);
}

function newChannel(key, persist) {
  return { key, entries: [], nextId: 1, persist };
}

// The active channel. Defaults to 'app' (ephemeral) — before any shop/template appears.
let active = newChannel('app', null);

// Change the rendering language: recompute `Text` for entries carrying an i18n
// descriptor (and separators) in the active channel and emit 'reset' with the
// refreshed buffer. Literal entries (without `msg`/`sepKey`) are left untouched.
export function setLanguage(newLang) {
  lang = newLang || 'pl';
  for (const e of active.entries) {
    if (e.msg || e.kind === 'separator') e.Text = renderText(e);
  }
  events.emit('reset', active.entries.slice());
}

// Switch the active channel. `opts.persist(entry)` writes live entries to disk.
// `opts.history` is previously saved entries ({TS,Text,Color,kind,msg,params,…})
// — loaded as historic (dimmed), with `Text` recomputed for the current language
// (when they carry an i18n descriptor), without re-saving.
export function setActiveChannel(key, opts = {}) {
  // detach long-pollers waiting on the old channel
  for (const w of [...waiters]) { waiters.delete(w); w.resolve([]); }
  const ch = newChannel(key, opts.persist || null);
  for (const h of opts.history || []) {
    const e = {
      Id: ch.nextId++, TS: h.TS, Color: h.Color, kind: h.kind, historic: true,
      msg: h.msg, params: h.params, sepKey: h.sepKey, sepTs: h.sepTs, Text: h.Text,
    };
    e.Text = renderText(e);
    ch.entries.push(e);
  }
  active = ch;
  events.emit('reset', ch.entries.slice());
  return ch;
}

export function activeKey() { return active.key; }

function push(entry) {
  active.entries.push(entry);
  if (active.entries.length > MAX) active.entries.shift();
  if (active.persist) { try { active.persist(entry); } catch {} }
  // wake up waiting long-pollers
  for (const w of [...waiters]) {
    const fresh = since(w.lastId);
    if (fresh.length) { waiters.delete(w); w.resolve(fresh); }
  }
  events.emit('entry', entry);
  return entry;
}

// `spec` is a literal (string) OR an i18n descriptor `{ msg, params }` (from tmsg()).
export function log(spec, color = COLORS.gray) {
  const e = { Id: active.nextId++, TS: new Date().toISOString(), Color: color };
  if (spec && typeof spec === 'object') { e.msg = spec.msg; e.params = spec.params || {}; }
  else { e.Text = String(spec); }
  e.Text = renderText(e);
  return push(e);
}

// Separator entry (e.g. a session boundary) — rendered as a divider line. `spec`
// is a literal (string) OR a descriptor `{ key, ts }` (translation key + time).
export function separator(spec) {
  const e = { Id: active.nextId++, TS: new Date().toISOString(), Color: COLORS.sep, kind: 'separator' };
  if (spec && typeof spec === 'object') { e.sepKey = spec.key; e.sepTs = spec.ts; }
  else { e.Text = String(spec); }
  e.Text = renderText(e);
  return push(e);
}

export const logInfo = (s) => log(s, COLORS.gray);
export const logOk = (s) => log(s, COLORS.green);
export const logErr = (s) => log(s, COLORS.red);

// Return entries of the active channel with Id > lastId.
export function since(lastId) {
  const n = Number(lastId) || 0;
  return active.entries.filter((e) => e.Id > n);
}

// Long-poll: wait for new entries (Id > lastId) or until the timeout.
// `registerCancel(fn)` allows canceling the wait when the client disconnects.
export function waitFor(lastId, timeoutMs, registerCancel) {
  const fresh = since(lastId);
  if (fresh.length) return Promise.resolve(fresh);
  return new Promise((resolve) => {
    const w = { lastId: Number(lastId) || 0, resolve };
    waiters.add(w);
    const timer = setTimeout(() => { waiters.delete(w); resolve([]); }, timeoutMs);
    w.resolve = (val) => { clearTimeout(timer); waiters.delete(w); resolve(val); };
    if (typeof registerCancel === 'function') {
      registerCancel(() => { clearTimeout(timer); waiters.delete(w); resolve([]); });
    }
  });
}

export function clear() {
  active.entries.length = 0;
}
