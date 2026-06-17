// Bufor logu zdarzeń synchronizacji. UI odpytuje /log?lastId=N.
// Wpis: { Id, TS, Text, Color }. Kolory jak w oryginale.

export const COLORS = {
  red: '#F00',    // błąd
  gray: '#666',   // info
  green: '#2A2',  // sukces
  white: '#FFF',  // domyślny
};

import { EventEmitter } from 'node:events';

let nextId = 1;
const entries = [];
const MAX = 1000;
const waiters = new Set(); // long-poll: { lastId, resolve }

// Emiter zdarzeń: 'entry' przy każdym nowym wpisie (dla Electron/IPC push).
export const events = new EventEmitter();
events.setMaxListeners(50);

export function log(text, color = COLORS.gray) {
  const e = { Id: nextId++, TS: new Date().toISOString(), Text: text, Color: color };
  entries.push(e);
  if (entries.length > MAX) entries.shift();
  // obudź oczekujących long-pollerów
  for (const w of [...waiters]) {
    const fresh = since(w.lastId);
    if (fresh.length) { waiters.delete(w); w.resolve(fresh); }
  }
  events.emit('entry', e);
  return e;
}

export const logInfo = (t) => log(t, COLORS.gray);
export const logOk = (t) => log(t, COLORS.green);
export const logErr = (t) => log(t, COLORS.red);

// Zwróć wpisy o Id > lastId.
export function since(lastId) {
  const n = Number(lastId) || 0;
  return entries.filter((e) => e.Id > n);
}

// Long-poll: czekaj na nowe wpisy (Id > lastId) lub do timeoutu.
// `onCancel(fn)` pozwala anulować oczekiwanie gdy klient się rozłączy.
export function waitFor(lastId, timeoutMs, registerCancel) {
  const fresh = since(lastId);
  if (fresh.length) return Promise.resolve(fresh);
  return new Promise((resolve) => {
    const w = { lastId: Number(lastId) || 0, resolve };
    waiters.add(w);
    const timer = setTimeout(() => { waiters.delete(w); resolve([]); }, timeoutMs);
    const done = (val) => { clearTimeout(timer); resolve(val); };
    w.resolve = (val) => { clearTimeout(timer); waiters.delete(w); resolve(val); };
    if (typeof registerCancel === 'function') {
      registerCancel(() => { clearTimeout(timer); waiters.delete(w); resolve([]); });
    }
  });
}

export function clear() {
  entries.length = 0;
}
