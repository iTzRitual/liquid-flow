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
// Wpis: { Id, TS, Text, Color, kind?, historic? }.
//  - kind:'separator'  — linia działowa (np. granica sesji),
//  - historic:true     — wpis wczytany z poprzedniej sesji (renderowany wyszarzony).

export const COLORS = {
  red: '#F00',    // błąd
  gray: '#666',   // info
  green: '#2A2',  // sukces
  white: '#FFF',  // domyślny
  sep: '#82bbff', // separator (jak Divider)
};

import { EventEmitter } from 'node:events';

const MAX = 1000;
const waiters = new Set(); // long-poll: { lastId, resolve }

// Emiter zdarzeń: 'entry' przy każdym nowym wpisie (push dla UI),
// 'reset' przy przełączeniu kanału (pełna podmiana bufora).
export const events = new EventEmitter();
events.setMaxListeners(50);

function newChannel(key, persist) {
  return { key, entries: [], nextId: 1, persist };
}

// Aktywny kanał. Domyślnie 'app' (efemeryczny) — zanim pojawi się sklep/szablon.
let active = newChannel('app', null);

// Przełącz aktywny kanał. `opts.persist(entry)` zapisuje live-wpisy na dysk.
// `opts.history` to wcześniej zapisane wpisy [{TS,Text,Color,kind}] — ładowane
// jako historyczne (wyszarzone), bez ponownego zapisu.
export function setActiveChannel(key, opts = {}) {
  // odepnij oczekujących long-pollerów ze starego kanału
  for (const w of [...waiters]) { waiters.delete(w); w.resolve([]); }
  const ch = newChannel(key, opts.persist || null);
  for (const h of opts.history || []) {
    ch.entries.push({ Id: ch.nextId++, TS: h.TS, Text: h.Text, Color: h.Color, kind: h.kind, historic: true });
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

export function log(text, color = COLORS.gray) {
  return push({ Id: active.nextId++, TS: new Date().toISOString(), Text: text, Color: color });
}

// Wpis-separator (np. granica sesji) — renderowany jako linia działowa.
export function separator(text) {
  return push({ Id: active.nextId++, TS: new Date().toISOString(), Text: text, Color: COLORS.sep, kind: 'separator' });
}

export const logInfo = (t) => log(t, COLORS.gray);
export const logOk = (t) => log(t, COLORS.green);
export const logErr = (t) => log(t, COLORS.red);

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
