import { describe, it, expect, afterEach } from 'vitest';
import { ISklep24Client, SoapError } from './soap.js';
import { endpointFor } from './soap.js';
import { startMockSoap, liquidTemplateXml } from '../../../test/helpers/mockSoapServer.js';

let srv;
afterEach(async () => { if (srv) await srv.close(); srv = null; });

describe('endpointFor', () => {
  it('docina końcowe ukośniki i dokleja ścieżkę usługi', () => {
    expect(endpointFor('https://sklep.pl//')).toBe('https://sklep.pl/iSklep24Service.asmx');
    expect(endpointFor('  https://sklep.pl  ')).toBe('https://sklep.pl/iSklep24Service.asmx');
  });
});

describe('SignIn', () => {
  it('zwraca true i wysyła SOAPAction z nazwą metody', async () => {
    srv = await startMockSoap({ handlers: { SignIn: () => true } });
    const client = new ISklep24Client(srv.url);
    expect(await client.signIn('webmaster', 'pass')).toBe(true);
    expect(srv.requests[0].method).toBe('SignIn');
    expect(srv.requests[0].body).toContain('<login>webmaster</login>');
  });

  it('zwraca false przy złych danych', async () => {
    srv = await startMockSoap({ handlers: { SignIn: () => false } });
    const client = new ISklep24Client(srv.url);
    expect(await client.signIn('x', 'y')).toBe(false);
  });
});

describe('auto-auth (cookie jar)', () => {
  it('call() loguje się automatycznie i wysyła cookie sesji w kolejnych żądaniach', async () => {
    srv = await startMockSoap({
      handlers: {
        SignIn: () => ({ resultXml: 'true', setCookie: 'ASP.NET_SessionId=abc123; path=/' }),
        Liquid_Get: () => ({ resultXml: '<Liquid><Id>1</Id><Name>Topaz</Name></Liquid>' }),
      },
    });
    const client = new ISklep24Client(srv.url);
    client.setCredentials('webmaster', 'pass');
    const list = await client.liquidGet();

    expect(list).toEqual([{ Id: 1, Name: 'Topaz', HasPassword: false, Locked: false }]);
    // pierwszy request to SignIn, drugi Liquid_Get z cookie
    expect(srv.requests.map((r) => r.method)).toEqual(['SignIn', 'Liquid_Get']);
    expect(srv.requests[1].cookie).toContain('ASP.NET_SessionId=abc123');
  });
});

describe('parsowanie odpowiedzi', () => {
  it('liquidFilesGet dekoduje zawartość z base64 do Buffera', async () => {
    srv = await startMockSoap({
      handlers: {
        SignIn: () => true,
        Liquid_FilesGet: () => ({
          resultXml: liquidTemplateXml({ id: 7, mode: 0, name: 'a.liquid', content: 'Hello', date: '2026-06-25T10:00:00' }),
        }),
      },
    });
    const client = new ISklep24Client(srv.url);
    client.setCredentials('webmaster', 'pass');
    const [f] = await client.liquidFilesGet({ TemplateId: 7 });
    expect(f.Name).toBe('a.liquid');
    expect(Buffer.isBuffer(f.Template)).toBe(true);
    expect(f.Template.toString('utf8')).toBe('Hello');
    expect(f.Date).toBe('2026-06-25T10:00:00');
  });

  it('liquidFilesMetaGet zwraca meta bez zawartości', async () => {
    srv = await startMockSoap({
      handlers: {
        SignIn: () => true,
        Liquid_FilesMetaGet: () => ({
          resultXml:
            liquidTemplateXml({ mode: 0, name: 'a.liquid', date: '2026-01-01T00:00:00' }) +
            liquidTemplateXml({ mode: 2, name: 'b.liquid', date: '2026-02-02T00:00:00' }),
        }),
      },
    });
    const client = new ISklep24Client(srv.url);
    client.setCredentials('webmaster', 'pass');
    const list = await client.liquidFilesMetaGet({ TemplateId: 7 });
    expect(list.map((f) => `${f.Mode}/${f.Name}`)).toEqual(['0/a.liquid', '2/b.liquid']);
    expect(list[0].Template).toBeNull();
  });
});

describe('błędy SOAP', () => {
  it('SOAP Fault → SoapError z komunikatem z detail', async () => {
    srv = await startMockSoap({
      handlers: { SignIn: () => ({ fault: { string: 'Bad', detail: 'Nieprawidłowe dane', code: 'soap:Client' } }) },
    });
    const client = new ISklep24Client(srv.url);
    await expect(client.signIn('x', 'y')).rejects.toBeInstanceOf(SoapError);
  });

  it('przekazuje detail jako message', async () => {
    srv = await startMockSoap({
      handlers: { SignIn: () => ({ fault: { detail: 'Sesja wygasła' } }) },
    });
    const client = new ISklep24Client(srv.url);
    await expect(client.signIn('x', 'y')).rejects.toThrow('Sesja wygasła');
  });
});
