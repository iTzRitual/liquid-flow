import React from 'react';
import { render } from 'ink';
import App from './App.jsx';

// Alternatywny bufor ekranu (jak vim/htop): aplikacja dostaje własny ekran bez
// historii przewijania, więc poprzednie klatki nie zostają w terminalu. Po
// wyjściu przywracamy bufor główny — terminal wraca do stanu sprzed startu.
// Dodatkowo „alternate scroll mode" (1007): w alt‑screenie kółko myszy wysyła
// strzałki ↑/↓ do aplikacji (a nie przewija terminal), dzięki czemu scroll
// przewija log na ekranie głównym.
const ENTER_ALT = '\x1b[?1049h\x1b[?1007h\x1b[H';
const LEAVE_ALT = '\x1b[?1007l\x1b[?1049l';

let left = false;
function leaveAlt() {
  if (left) return;
  left = true;
  try { process.stdout.write(LEAVE_ALT); } catch {}
}

process.stdout.write(ENTER_ALT);
// Bezpiecznik: przywróć ekran nawet przy nieoczekiwanym zakończeniu/crashu.
process.on('exit', leaveAlt);

// Referencja do unmount Inka — ustawiana poniżej po render(); sygnały
// nie mogą przyjść przed końcem bloku synchronicznego.
let _unmount = () => {};
for (const sig of ['SIGTERM', 'SIGHUP']) {
  // unmount() uruchamia cleanup React (→ ctrl.dispose()), co zamyka sesję
  // synchronizacji zanim proces zginie.
  process.on(sig, () => { _unmount(); leaveAlt(); process.exit(0); });
}
// Świadomie ignorujemy Ctrl+C, żeby przypadkowe naciśnięcie nie ubiło sesji
// synchronizacji. Wyjście tylko przez komendę /exit (albo zamknięcie terminala).
// W trybie raw terminal nie wysyła SIGINT — Ink dostaje \x03 i dzięki
// exitOnCtrlC:false go ignoruje; ten handler to zabezpieczenie na wypadek
// braku raw mode (np. inny terminal/pipe).
process.on('SIGINT', () => {});

const { waitUntilExit, unmount } = render(<App />, { exitOnCtrlC: false });
_unmount = unmount;
try {
  await waitUntilExit();
} finally {
  leaveAlt();
}
