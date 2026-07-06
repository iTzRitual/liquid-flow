import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { startCli, makeHome, keys, delay } from '../../../../test/helpers/cliPty.js';

// Black box: we launch the REAL bin/liquidflow.js under a pseudo-TTY. Without any
// shop configured — on startup the CLI auto-opens the "Connect to shop" screen.
let cli, home;
afterEach(async () => {
  if (cli) { cli.kill(); cli = null; }
  if (home) { try { fs.rmSync(home, { recursive: true, force: true }); } catch {} home = null; }
});

describe('CLI e2e — boot i wyjście', () => {
  it('startuje i pokazuje ekran połączenia (auto‑otwarty gdy niepołączony)', async () => {
    home = makeHome();
    cli = await startCli({ home });
    // the ConnectList screen title in Polish (the default language)
    await cli.waitFor('Połącz ze sklepem');
    expect(cli.output).toContain('Połącz ze sklepem');
  });

  it('kończy się czysto (kod 0) po komendzie /exit', async () => {
    home = makeHome();
    cli = await startCli({ home });
    await cli.waitFor('Połącz ze sklepem');
    const code = await cli.exit();
    expect(code).toBe(0);
  });

  it('paleta slash filtruje komendy po wpisaniu /', async () => {
    home = makeHome();
    cli = await startCli({ home });
    await cli.waitFor('Połącz ze sklepem');
    // '/' from the ConnectList screen → onSlash → enter the input with the palette open
    cli.write(keys.slash);
    await delay(150);
    cli.write('set'); // narrow down to /settings
    await cli.waitFor('/settings');
    expect(cli.output).toContain('/settings');
    cli.kill();
  });
});
