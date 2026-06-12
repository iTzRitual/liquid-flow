// Klient SOAP dla web-service'u Comarch iSklep24 (iSklep24Service.asmx).
// Odtworzony z dekompilacji oryginalnej aplikacji COMARCHeShopLiquidSync.exe.
//
//   Namespace        : http://www.icomarch24.pl/iSklep24
//   Endpoint         : <urlSklepu>/iSklep24Service.asmx
//   SOAPAction       : http://www.icomarch24.pl/iSklep24/<Metoda>
//   Binding          : document/literal (ASMX)

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { escapeXml, parseXml, findDeep, findAll, find, text, localName } from './xml.js';

const NS = 'http://www.icomarch24.pl/iSklep24';
const SOAP_ENV = 'http://schemas.xmlsoap.org/soap/envelope/';

// Odpowiednik CM7ScEmraY: url.Trim().TrimEnd('/') + '/' + 'iSklep24Service.asmx'
export function endpointFor(shopUrl) {
  return shopUrl.trim().replace(/\/+$/, '') + '/iSklep24Service.asmx';
}

function buildEnvelope(method, innerXml) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
    ` xmlns:soap="${SOAP_ENV}">` +
    '<soap:Body>' +
    `<${method} xmlns="${NS}">${innerXml}</${method}>` +
    '</soap:Body></soap:Envelope>'
  );
}

// Serializacja LiquidTemplate zgodnie z kolejnością pól klasy .NET:
// TemplateId, Mode, Name, Template(base64Binary), Date.
// Name/Template pomijamy gdy puste (tak robi XmlSerializer dla null).
function templateXml(tpl, tag = 'tpl') {
  let x = '';
  x += `<TemplateId>${tpl.TemplateId | 0}</TemplateId>`;
  x += `<Mode>${tpl.Mode | 0}</Mode>`;
  if (tpl.Name != null && tpl.Name !== '') x += `<Name>${escapeXml(tpl.Name)}</Name>`;
  if (tpl.Template != null) {
    const b64 = Buffer.isBuffer(tpl.Template)
      ? tpl.Template.toString('base64')
      : Buffer.from(tpl.Template).toString('base64');
    x += `<Template>${b64}</Template>`;
  }
  const date = tpl.Date || '0001-01-01T00:00:00';
  x += `<Date>${date}</Date>`;
  return `<${tag}>${x}</${tag}>`;
}

// Prosty „cookie jar” — przechowuje sesję uwierzytelnienia (jak CookieContainer w oryginale).
class CookieJar {
  constructor() { this.cookies = new Map(); }
  store(setCookieHeaders) {
    if (!setCookieHeaders) return;
    for (const sc of [].concat(setCookieHeaders)) {
      const pair = sc.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header() {
    if (!this.cookies.size) return null;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function rawRequest(endpoint, soapAction, body, { insecureTLS = false, timeout = 120000, jar = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(endpoint);
    const lib = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(body, 'utf8');
    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'Content-Length': data.length,
      SOAPAction: `"${soapAction}"`,
      'User-Agent': 'LiquidSyncMac/1.0',
    };
    const cookieHeader = jar && jar.header();
    if (cookieHeader) headers.Cookie = cookieHeader;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        rejectUnauthorized: !insecureTLS,
        headers,
      },
      (res) => {
        if (jar) jar.store(res.headers['set-cookie']);
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.setTimeout(timeout, () => req.destroy(new Error('Przekroczono limit czasu połączenia (timeout)')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export { CookieJar };

export class SoapError extends Error {
  constructor(message, { code, faultCodeName } = {}) {
    super(message);
    this.name = 'SoapError';
    this.code = code;
    this.faultCodeName = faultCodeName;
  }
}

function parseFault(root) {
  const fault = findDeep(root, 'Fault');
  if (!fault) return null;
  const faultstring = text(find(fault, 'faultstring')) || 'SOAP Fault';
  const faultcodeNode = find(fault, 'faultcode');
  const faultcode = faultcodeNode ? text(faultcodeNode) : '';
  // detail/message
  let detailMsg = null;
  const detail = find(fault, 'detail');
  if (detail) {
    const msg = findDeep(detail, 'Message') || findDeep(detail, 'message');
    if (msg) detailMsg = text(msg);
  }
  const codeName = faultcode.includes(':') ? faultcode.split(':').pop() : faultcode;
  return new SoapError(detailMsg || faultstring, { code: faultcode, faultCodeName: codeName });
}

const REAUTH_MS = 8 * 60 * 60 * 1000; // re-login co 8h, jak w oryginale

export class ISklep24Client {
  constructor(shopUrl, opts = {}) {
    this.endpoint = endpointFor(shopUrl);
    this.opts = { ...opts };
    this.jar = new CookieJar();
    this.opts.jar = this.jar;
    this.credentials = null; // { login, password }
    this.lastAuth = 0;
  }

  setCredentials(login, password) {
    this.credentials = { login, password };
    this.lastAuth = 0; // wymuś ponowne logowanie
  }

  // Niskopoziomowe wywołanie (bez auto-logowania) — używane przez signIn.
  async _raw(method, innerXml) {
    const env = buildEnvelope(method, innerXml);
    const action = `${NS}/${method}`;
    const { status, body } = await rawRequest(this.endpoint, action, env, this.opts);
    const root = parseXml(body);
    const fault = parseFault(root);
    if (fault) throw fault;
    if (status >= 400) throw new SoapError(`HTTP ${status} z serwera SOAP`);
    const result = findDeep(root, `${method}Result`);
    return { root, result };
  }

  // Upewnij się, że sesja jest uwierzytelniona (cookie sesji aktualne).
  async _ensureAuth() {
    if (!this.credentials) return;
    if (this.jar.header() && Date.now() - this.lastAuth < REAUTH_MS) return;
    const ok = await this.signIn(this.credentials.login, this.credentials.password);
    if (!ok) throw new SoapError('Nieprawidłowa nazwa użytkownika lub hasło');
    this.lastAuth = Date.now();
  }

  // Wywołanie z gwarancją uwierzytelnienia.
  async call(method, innerXml) {
    await this._ensureAuth();
    return this._raw(method, innerXml);
  }

  // SignIn(login, password) -> bool. Ustawia cookie sesji w jar.
  async signIn(login, password) {
    const inner = `<login>${escapeXml(login)}</login><password>${escapeXml(password)}</password>`;
    const { result } = await this._raw('SignIn', inner);
    const ok = text(result).trim().toLowerCase() === 'true';
    if (ok) this.lastAuth = Date.now();
    return ok;
  }

  // Liquid_Get() -> Liquid[] { Id, Name, HasPassword, Locked }
  async liquidGet() {
    const { result } = await this.call('Liquid_Get', '');
    if (!result) return [];
    return findAll(result, 'Liquid').map((n) => ({
      Id: parseInt(text(find(n, 'Id')) || '0', 10),
      Name: text(find(n, 'Name')),
      HasPassword: text(find(n, 'HasPassword')).trim().toLowerCase() === 'true',
      Locked: text(find(n, 'Locked')).trim().toLowerCase() === 'true',
    }));
  }

  // Liquid_Unlock(liqId, password) -> bool
  async liquidUnlock(liqId, password) {
    const inner = `<liqId>${liqId | 0}</liqId><password>${escapeXml(password || '')}</password>`;
    const { result } = await this.call('Liquid_Unlock', inner);
    return text(result).trim().toLowerCase() === 'true';
  }

  _parseTemplates(result) {
    if (!result) return [];
    return findAll(result, 'LiquidTemplate').map((n) => {
      const tplB64 = text(find(n, 'Template'));
      return {
        TemplateId: parseInt(text(find(n, 'TemplateId')) || '0', 10),
        Mode: parseInt(text(find(n, 'Mode')) || '0', 10),
        Name: text(find(n, 'Name')),
        Template: tplB64 ? Buffer.from(tplB64, 'base64') : null,
        Date: text(find(n, 'Date')),
      };
    });
  }

  // Liquid_FilesGet(tpl) -> LiquidTemplate[] (z zawartością)
  async liquidFilesGet(tpl) {
    const { result } = await this.call('Liquid_FilesGet', templateXml(tpl));
    return this._parseTemplates(result);
  }

  // Liquid_FilesMetaGet(tpl) -> LiquidTemplate[] (tylko meta, bez zawartości)
  async liquidFilesMetaGet(tpl) {
    const { result } = await this.call('Liquid_FilesMetaGet', templateXml(tpl));
    return this._parseTemplates(result);
  }

  // Liquid_FileSet(tpl) -> void  (nadpisz istniejący plik)
  async liquidFileSet(tpl) {
    await this.call('Liquid_FileSet', templateXml(tpl));
  }

  // Liquid_FileIsValid(tpl) -> bool
  async liquidFileIsValid(tpl) {
    const { result } = await this.call('Liquid_FileIsValid', templateXml(tpl));
    return text(result).trim().toLowerCase() === 'true';
  }

  // Liquid_FileAdd(tpl) -> void  (dodaj nowy plik)
  async liquidFileAdd(tpl) {
    await this.call('Liquid_FileAdd', templateXml(tpl));
  }

  // Liquid_FileDelete(tpl) -> void
  async liquidFileDelete(tpl) {
    await this.call('Liquid_FileDelete', templateXml(tpl));
  }

  // Liquid_FileRename(tpl, newName) -> void
  async liquidFileRename(tpl, newName) {
    const inner = templateXml(tpl) + `<newName>${escapeXml(newName)}</newName>`;
    await this.call('Liquid_FileRename', inner);
  }
}
