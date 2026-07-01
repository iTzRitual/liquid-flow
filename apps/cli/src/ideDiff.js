// Otwieranie podglądu konfliktu jako diff w zewnętrznym IDE (domyślnie VS Code
// `code --diff`), żeby użytkownik mógł rozwiązać go bezpośrednio w edytorze i
// zapisać zmiany do prawdziwego pliku lokalnego (który potem trafia do gita).

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let scratchDir = null;
function scratch() {
  if (!scratchDir) scratchDir = mkdtempSync(path.join(tmpdir(), 'liquidflow-diff-'));
  return scratchDir;
}

// Zapisuje zdalną wersję pliku do katalogu tymczasowego (do porównania) i
// zwraca jej ścieżkę. Zawartość jest tylko do referencji — edycja lokalnej
// strony w IDE zapisuje się do prawdziwej ścieżki lokalnej.
export function writeRemoteTemp(name, content) {
  const dest = path.join(scratch(), 'remote', name);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, content ?? '');
  return dest;
}

// Odpala IDE w trybie diff (dwie ścieżki). Komenda nadpisywalna przez
// LIQUIDFLOW_DIFF_CMD (domyślnie `code`, kompatybilne z forkami VS Code jak
// Cursor: `LIQUIDFLOW_DIFF_CMD=cursor`).
export function openIdeDiff(localPath, remotePath, onError) {
  const cmd = process.env.LIQUIDFLOW_DIFF_CMD || 'code';
  try {
    const child = spawn(cmd, ['--diff', localPath, remotePath], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => onError?.(cmd, err));
    child.unref();
  } catch (err) {
    onError?.(cmd, err);
  }
}
