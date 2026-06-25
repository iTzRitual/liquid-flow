import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { startCli, makeHome, keys, delay } from '../../../../test/helpers/cliPty.js';
import { startMockSoap } from '../../../../test/helpers/mockSoapServer.js';

// Pełny przepływ przez PRAWDZIWY binarny CLI: ConnectList → wybór sklepu →
// SignIn → Liquid_Get → picker szablonów. Sklep wskazuje na lokalny mock SOAP
// (osobny proces testowy, realne gniazdo http), więc nie ma sieci ani sklepu.
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

    // Zapisany sklep z hasłem (plaintext → decrypt zwraca jak jest, zgodność wstecz).
    home = makeHome({
      Language: 'pl',
      Shops: [{ Id: 1, Name: 'mocksklep', Url: srv.url, Login: 'webmaster', SavePassword: true, Password: 'pw' }],
    });

    cli = await startCli({ home });
    await cli.waitFor('Połącz ze sklepem');
    expect(cli.output).toContain('mocksklep'); // sklep widoczny na liście

    // Enter na pierwszym sklepie → signInSaved → openTemplatesPicker
    cli.write(keys.enter);

    // Po zalogowaniu pojawia się picker szablonów z nazwą z Liquid_Get
    await cli.waitFor('Wybierz szablon', 12000);
    await cli.waitFor('TopazTest');
    expect(cli.output).toContain('TopazTest');

    // mock dostał realne żądania SOAP od binarki
    expect(srv.requests.map((r) => r.method)).toContain('SignIn');
    expect(srv.requests.map((r) => r.method)).toContain('Liquid_Get');
  });
});
