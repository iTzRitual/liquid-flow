import React from 'react';
import { render } from 'ink';
import App from './App.jsx';

// Alternatywny bufor ekranu (jak vim/htop): aplikacja dostaje własny ekran bez
// historii przewijania, więc poprzednie klatki nie zostają w terminalu. Po
// wyjściu przywracamy bufor główny — terminal wraca do stanu sprzed startu.
const ENTER_ALT = '\x1b[?1049h\x1b[H';
const LEAVE_ALT = '\x1b[?1049l';

let left = false;
function leaveAlt() {
  if (left) return;
  left = true;
  try { process.stdout.write(LEAVE_ALT); } catch {}
}

process.stdout.write(ENTER_ALT);
// Bezpiecznik: przywróć ekran nawet przy nieoczekiwanym zakończeniu/crashu.
process.on('exit', leaveAlt);
for (const sig of ['SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { leaveAlt(); process.exit(0); });
}

const { waitUntilExit } = render(<App />);
try {
  await waitUntilExit();
} finally {
  leaveAlt();
}
