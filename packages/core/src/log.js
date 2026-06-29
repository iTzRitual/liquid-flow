// Bufor logu zdarzeń synchronizacji — z podziałem na kanały (scope).
//
// W danym momencie aktywny jest dokładnie jeden kanał (bo aktywna jest tylko
// jedna sesja synchronizacji naraz). Producenci nadal wołają logInfo/logOk/
// logErr bez wiedzy o kanale — wpis trafia do bieżącego kanału. Controller
// przełącza kanał przy połączeniu sklepu / wyborze szablonu / rozłączeniu:
//   'app'                 — przed połączeniem (efemeryczny)
//   'shop:<id>'           — połączony sklep, brak szablonu (efemeryczny)
//   'tpl:<shopId>:<tplId>' — aktywny szablon (TRWAŁY: persist do pliku)
//
// Wpis: { Id, TS, Text, Color, kind?, historic?, msg?, params?, sepKey?, sepTs? }.
//  - kind:'separator'  — linia działowa (np. granica sesji),
//  - historic:true     — wpis wczytany z poprzedniej sesji (renderowany wyszarzony),
//  - msg + params      — DESKRYPTOR i18n: klucz tłumaczenia + parametry do `tfmt`.
//    `Text` jest renderowany z deskryptora dla BIEŻĄCEGO języka. Dzięki temu
//    `setLanguage` przerysowuje cały widoczny log (i wczytaną historię) na nowy
//    język. Wpisy bez `msg` (literały: surowe błędy/stderr) zostają jak są.
//  - sepKey + sepTs    — wariant deskryptora dla separatora (klucz + znacznik czasu).

import { EventEmitter } from 'node:events';
import { translationsFor, tfmt, localeFor } from './translations.js';

export const COLORS = {
  red: '#F00',    // błąd
  gray: '#666',   // info
  green: '#2A2',  // sukces
  white: '#FFF',  // domyślny
  sep: '#82bbff', // separator (jak Divider)
};

const MAX = 1000;
const waiters = new Set(); // long-poll: { lastId, resolve }

// Bieżący język renderowania logu. Zmieniany przez Controller.setLanguage.
let lang = 'pl';

// Emiter zdarzeń: 'entry' przy każdym nowym wpisie (push dla UI),
// 'reset' przy przełączeniu kanału / zmianie języka (pełna podmiana bufora).
export const events = new EventEmitter();
events.setMaxListeners(50);

// Pomocnik dla producentów: zbuduj deskryptor i18n `{ msg, params }`.
// Użycie: logOk(tmsg('ConnectedToShop', { name })).
export function tmsg(key, params = {}) {
  return { msg: key, params };
}

// Spłaszcz tekst wpisu do JEDNEGO wiersza — surowy stderr gita bywa wielolinijkowy,
// a LogPane liczy 1 wpis = 1 wiersz; osadzony \n rozsadza budżet (duplikacja kadru).
function oneLine(s) {
  return String(s).replace(/[\t\f\v]+/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ⏎ ').trim();
}

// Wyrenderuj `Text` wpisu dla bieżącego języka.
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

// Aktywny kanał. Domyślnie 'app' (efemeryczny) — zanim pojawi się sklep/szablon.
let active = newChannel('app', null);

// Zmień język renderowania: przelicz `Text` dla wpisów z deskryptorem i18n
// (oraz separatorów) w aktywnym kanale i wyemituj 'reset' z odświeżonym buforem.
// Wpisy-literały (bez `msg`/`sepKey`) pozostają nietknięte.
export function setLanguage(newLang) {
  lang = newLang || 'pl';
  for (const e of active.entries) {
    if (e.msg || e.kind === 'separator') e.Text = renderText(e);
  }
  events.emit('reset', active.entries.slice());
}

// Przełącz aktywny kanał. `opts.persist(entry)` zapisuje live-wpisy na dysk.
// `opts.history` to wcześniej zapisane wpisy ({TS,Text,Color,kind,msg,params,…})
// — ładowane jako historyczne (wyszarzone), z `Text` przeliczonym na bieżący
// język (gdy niosą deskryptor i18n), bez ponownego zapisu.
export function setActiveChannel(key, opts = {}) {
  // odepnij oczekujących long-pollerów ze starego kanału
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
  // obudź oczekujących long-pollerów
  for (const w of [...waiters]) {
    const fresh = since(w.lastId);
    if (fresh.length) { waiters.delete(w); w.resolve(fresh); }
  }
  events.emit('entry', entry);
  return entry;
}

// `spec` to literał (string) ALBO deskryptor i18n `{ msg, params }` (z tmsg()).
export function log(spec, color = COLORS.gray) {
  const e = { Id: active.nextId++, TS: new Date().toISOString(), Color: color };
  if (spec && typeof spec === 'object') { e.msg = spec.msg; e.params = spec.params || {}; }
  else { e.Text = String(spec); }
  e.Text = renderText(e);
  return push(e);
}

// Wpis-separator (np. granica sesji) — renderowany jako linia działowa. `spec`
// to literał (string) ALBO deskryptor `{ key, ts }` (klucz tłumaczenia + czas).
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

// Zwróć wpisy aktywnego kanału o Id > lastId.
export function since(lastId) {
  const n = Number(lastId) || 0;
  return active.entries.filter((e) => e.Id > n);
}

// Long-poll: czekaj na nowe wpisy (Id > lastId) lub do timeoutu.
// `registerCancel(fn)` pozwala anulować oczekiwanie gdy klient się rozłączy.
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
