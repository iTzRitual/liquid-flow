// Opens a conflict preview as a diff in an external IDE (VS Code's `code --diff`
// by default), so the user can resolve it directly in the editor and save changes
// to the real local file (which later flows into git).

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let scratchDir = null;
function scratch() {
  if (!scratchDir) scratchDir = mkdtempSync(path.join(tmpdir(), 'liquidflow-diff-'));
  return scratchDir;
}

// Writes the remote version of a file to a temporary directory (for comparison)
// and returns its path. The content is for reference only — editing the local
// side in the IDE saves to the real local path.
export function writeRemoteTemp(name, content) {
  const dest = path.join(scratch(), 'remote', name);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, content ?? '');
  return dest;
}

// Launches the IDE in diff mode (two paths). The command is overridable via
// LIQUIDFLOW_DIFF_CMD (default `code`, compatible with VS Code forks like
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
