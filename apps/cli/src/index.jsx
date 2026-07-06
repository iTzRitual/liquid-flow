import React from 'react';
import { render } from 'ink';
import App from './App.jsx';

// Alternate screen buffer (like vim/htop): the app gets its own screen without
// scrollback history, so previous frames do not linger in the terminal. On exit we
// restore the main buffer — the terminal returns to its pre-start state.
// Additionally "alternate scroll mode" (1007): in the alt screen the mouse wheel
// sends ↑/↓ arrows to the application (instead of scrolling the terminal), which
// lets scrolling move the log on the main screen.
const ENTER_ALT = '\x1b[?1049h\x1b[?1007h\x1b[H';
const LEAVE_ALT = '\x1b[?1007l\x1b[?1049l';

let left = false;
function leaveAlt() {
  if (left) return;
  left = true;
  try { process.stdout.write(LEAVE_ALT); } catch {}
}

process.stdout.write(ENTER_ALT);
// Safeguard: restore the screen even on an unexpected exit/crash.
process.on('exit', leaveAlt);

// Reference to Ink's unmount — set below after render(); signals cannot arrive
// before the end of the synchronous block.
let _unmount = () => {};
for (const sig of ['SIGTERM', 'SIGHUP']) {
  // unmount() runs React's cleanup (→ ctrl.dispose()), which closes the sync
  // session before the process dies.
  process.on(sig, () => { _unmount(); leaveAlt(); process.exit(0); });
}
// We intentionally ignore Ctrl+C, so an accidental press does not kill the sync
// session. The only way out is the /exit command (or closing the terminal).
// In raw mode the terminal does not send SIGINT — Ink receives \x03 and, thanks to
// exitOnCtrlC:false, ignores it; this handler is a safeguard in case raw mode is
// unavailable (e.g. another terminal/pipe).
process.on('SIGINT', () => {});

const { waitUntilExit, unmount } = render(<App />, { exitOnCtrlC: false });
_unmount = unmount;
try {
  await waitUntilExit();
} finally {
  leaveAlt();
}
