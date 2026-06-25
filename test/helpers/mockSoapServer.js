// Lokalny serwer HTTP udający web-service Comarch e-Sklep (iSklep24Service.asmx).
// Pozwala testować `ISklep24Client` / `SyncSession` na PRAWDZIWYM gnieździe
// (klient wspiera http i sam buduje endpoint przez `endpointFor`), bez sieci i
// bez prawdziwego sklepu.
//
//   const srv = await startMockSoap({ handlers: { SignIn: () => true } });
//   const client = new ISklep24Client(srv.url);   // url = http://127.0.0.1:PORT
//   ...
//   srv.requests  // przechwycone żądania [{ method, body }]
//   await srv.close();
//
// `handlers[method]` to funkcja (req) => wynik:
//   - string/number/bool → owijane w <MethodResult>…</MethodResult>
//   - { resultXml }       → surowy XML wstawiany jako wnętrze <MethodResult>
//   - { fault }           → zwraca SOAP Fault (fault.string / fault.code / fault.detail)
//   - { setCookie }       → dokłada nagłówek Set-Cookie (do testu jara sesji)
//   - { raw }             → cała koperta odpowiedzi (pełna kontrola)
import http from 'node:http';

const NS = 'http://www.icomarch24.pl/iSklep24';

function envelope(method, inner) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body>' +
    `<${method}Response xmlns="${NS}">` +
    `<${method}Result>${inner}</${method}Result>` +
    `</${method}Response>` +
    '</soap:Body></soap:Envelope>'
  );
}

function faultEnvelope({ string = 'SOAP Fault', code = 'soap:Server', detail } = {}) {
  const detailXml = detail ? `<detail><Message>${detail}</Message></detail>` : '';
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><soap:Fault>' +
    `<faultcode>${code}</faultcode><faultstring>${string}</faultstring>${detailXml}` +
    '</soap:Fault></soap:Body></soap:Envelope>'
  );
}

// Wydobądź nazwę metody z nagłówka SOAPAction ("…/iSklep24/SignIn").
function methodFromAction(action = '') {
  const m = String(action).replace(/"/g, '').split('/').pop();
  return m || '';
}

export function startMockSoap({ handlers = {} } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const method = methodFromAction(req.headers.soapaction);
      requests.push({ method, body, cookie: req.headers.cookie || null });

      const handler = handlers[method];
      let out = handler ? handler({ method, body }) : '';

      const headers = { 'Content-Type': 'text/xml; charset=utf-8' };
      let payload;
      if (out && typeof out === 'object' && out.fault) {
        res.writeHead(500, headers);
        payload = faultEnvelope(out.fault);
      } else {
        if (out && typeof out === 'object') {
          if (out.setCookie) headers['Set-Cookie'] = out.setCookie;
          if (out.raw != null) payload = out.raw;
          else payload = envelope(method, out.resultXml != null ? out.resultXml : '');
        } else if (typeof out === 'boolean') {
          payload = envelope(method, out ? 'true' : 'false');
        } else {
          payload = envelope(method, out == null ? '' : String(out));
        }
        res.writeHead(200, headers);
      }
      res.end(payload);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Pomocnik: zbuduj <LiquidTemplate> z zawartością (base64) — do odpowiedzi
// Liquid_FilesGet / Liquid_FilesMetaGet.
export function liquidTemplateXml({ id = 0, mode = 0, name = '', content = null, date = '0001-01-01T00:00:00' }) {
  const tpl =
    `<TemplateId>${id}</TemplateId><Mode>${mode}</Mode>` +
    (name ? `<Name>${name}</Name>` : '') +
    (content != null ? `<Template>${Buffer.from(content).toString('base64')}</Template>` : '') +
    `<Date>${date}</Date>`;
  return `<LiquidTemplate>${tpl}</LiquidTemplate>`;
}
