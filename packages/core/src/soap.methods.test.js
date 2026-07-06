import { describe, it, expect, afterEach } from 'vitest';
import { ISklep24Client } from './soap.js';
import { startMockSoap } from '../../../test/helpers/mockSoapServer.js';

// Coverage of the remaining SOAP contract methods (CLAUDE.md: protocol "must NOT change").
// We check the method name, the request body (field order/fields) and result parsing.
let srv;
afterEach(async () => { if (srv) await srv.close(); srv = null; });

async function client(handlers) {
  srv = await startMockSoap({ handlers: { SignIn: () => true, ...handlers } });
  const c = new ISklep24Client(srv.url);
  c.setCredentials('webmaster', 'pw');
  return c;
}

describe('liquidUnlock', () => {
  it('wysyła liqId/password i parsuje bool', async () => {
    const c = await client({ Liquid_Unlock: () => true });
    expect(await c.liquidUnlock(5, 'tajne')).toBe(true);
    const req = srv.requests.find((r) => r.method === 'Liquid_Unlock');
    expect(req.body).toContain('<liqId>5</liqId>');
    expect(req.body).toContain('<password>tajne</password>');
  });

  it('false gdy serwer odmawia', async () => {
    const c = await client({ Liquid_Unlock: () => false });
    expect(await c.liquidUnlock(5, 'złe')).toBe(false);
  });
});

describe('liquidFileIsValid', () => {
  it('parsuje bool z wyniku', async () => {
    const c = await client({ Liquid_FileIsValid: () => true });
    expect(await c.liquidFileIsValid({ TemplateId: 1, Mode: 0, Name: 'a.liquid' })).toBe(true);
  });
});

describe('operacje plikowe (void) — poprawna nazwa metody i serializacja', () => {
  it('liquidFileAdd wysyła Liquid_FileAdd z polami szablonu', async () => {
    const c = await client({ Liquid_FileAdd: () => '' });
    await c.liquidFileAdd({ TemplateId: 3, Mode: 0, Name: 'x.liquid', Template: Buffer.from('hej') });
    const req = srv.requests.find((r) => r.method === 'Liquid_FileAdd');
    expect(req.body).toContain('<TemplateId>3</TemplateId>');
    expect(req.body).toContain('<Mode>0</Mode>');
    expect(req.body).toContain('<Name>x.liquid</Name>');
    expect(req.body).toContain('<Template>' + Buffer.from('hej').toString('base64') + '</Template>');
  });

  it('liquidFileSet wysyła Liquid_FileSet', async () => {
    const c = await client({ Liquid_FileSet: () => '' });
    await c.liquidFileSet({ TemplateId: 3, Mode: 0, Name: 'x.liquid', Template: Buffer.from('y') });
    expect(srv.requests.some((r) => r.method === 'Liquid_FileSet')).toBe(true);
  });

  it('liquidFileDelete wysyła Liquid_FileDelete', async () => {
    const c = await client({ Liquid_FileDelete: () => '' });
    await c.liquidFileDelete({ TemplateId: 3, Mode: 0, Name: 'x.liquid' });
    expect(srv.requests.some((r) => r.method === 'Liquid_FileDelete')).toBe(true);
  });

  it('liquidFileRename dokłada <newName>', async () => {
    const c = await client({ Liquid_FileRename: () => '' });
    await c.liquidFileRename({ TemplateId: 3, Mode: 0, Name: 'old.liquid' }, 'new.liquid');
    const req = srv.requests.find((r) => r.method === 'Liquid_FileRename');
    expect(req.body).toContain('<newName>new.liquid</newName>');
  });
});
