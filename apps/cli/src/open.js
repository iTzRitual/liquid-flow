// Otwieranie ścieżki/URL w domyślnej aplikacji systemowej (odpowiednik
// shell.openPath/openExternal z wersji desktopowej).

import { spawn } from 'node:child_process';

export function openExternal(target) {
  if (!target) return;
  let cmd, args;
  if (process.platform === 'darwin') { cmd = 'open'; args = [target]; }
  else if (process.platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '', target]; }
  else { cmd = 'xdg-open'; args = [target]; }
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* brak systemowego openera — ignoruj */
  }
}
