import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { startCli, makeHome, keys, delay } from '../../../../test/helpers/cliPty.js';
import { startMockSoap } from '../../../../test/helpers/mockSoapServer.js';

// Full flow through the REAL CLI binary: ConnectList → shop selection →
// SignIn → Liquid_Get → template picker. The shop points at a local mock SOAP
// (a separate test process, a real http socket), so there is no network or shop.
let cli, home, srv;
afterEach(async () => {
  if (cli) { cli.kill(); cli = null; }
  if (srv) { await srv.close(); srv = null; }
  if (home) { try { fs.rmSync(home, { recursive: true, force: true }); } catch {} home = null; }
});

describe('CLI e2e — połączenie ze sklepem (mock SOAP)', () => {
  it('łączy z zapisanym sklepem i pokazuje listę szablonów', async () => {
    srv = await startMockSoap({
      handlers: {
        SignIn: () => ({ resultXml: 'true', setCookie: 'ASP.NET_SessionId=e2e; path=/' }),
        Liquid_Get: () => ({ resultXml: '<Liquid><Id>5</Id><Name>TopazTest</Name><HasPassword>false</HasPassword><Locked>false</Locked></Liquid>' }),
      },
    });

    // A saved shop with a password (plaintext → decrypt returns it as-is, backward compatibility).
    home = makeHome({
      Language: 'pl',
      Shops: [{ Id: 1, Name: 'mocksklep', Url: srv.url, Login: 'webmaster', SavePassword: true, Password: 'pw' }],
    });

    cli = await startCli({ home });
    await cli.waitFor('Połącz ze sklepem');
    expect(cli.output).toContain('mocksklep'); // the shop is visible in the list

    // Enter on the first shop → signInSaved → openTemplatesPicker
    cli.write(keys.enter);

    // After signing in, the template picker appears with the name from Liquid_Get
    await cli.waitFor('Wybierz szablon', 12000);
    await cli.waitFor('TopazTest');
    expect(cli.output).toContain('TopazTest');

    // the mock received real SOAP requests from the binary
    expect(srv.requests.map((r) => r.method)).toContain('SignIn');
    expect(srv.requests.map((r) => r.method)).toContain('Liquid_Get');
  });
});
