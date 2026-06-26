// Minimalny parser i serializator XML wystarczający dla SOAP iSklep24.
// Bez zależności zewnętrznych.

export function escapeXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

// Parsuje XML do drzewa obiektów: { name, attrs, children:[], text }
export function parseXml(xml) {
  // usuń deklarację XML i komentarze; sekcje CDATA nie są obsługiwane —
  // Comarch ich nie wysyła, ale trafiłyby do tekstu bez dekodowania.
  xml = xml.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  // Atrybuty tylko z cudzysłowem podwójnym ("..."); apostrofy ('...') nie są obsługiwane
  // — kontrakt ASMX zawsze używa ", więc nie stanowi to problemu w praktyce.
  const tokenRe = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let m;
  while ((m = tokenRe.exec(xml)) !== null) {
    const [, closing, name, rawAttrs, selfClose, text] = m;
    if (text !== undefined) {
      const t = unescapeXml(text);
      if (t.trim().length) stack[stack.length - 1].text += t;
      continue;
    }
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    if (rawAttrs) {
      const ar = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
      let am;
      while ((am = ar.exec(rawAttrs)) !== null) attrs[am[1]] = unescapeXml(am[2]);
    }
    const node = { name, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

// Pomijając przestrzenie nazw – dopasowanie po lokalnej części nazwy.
export function localName(n) {
  const i = n.indexOf(':');
  return i === -1 ? n : n.slice(i + 1);
}

export function findAll(node, name) {
  const out = [];
  for (const c of node.children) if (localName(c.name) === name) out.push(c);
  return out;
}

export function find(node, name) {
  for (const c of node.children) if (localName(c.name) === name) return c;
  return null;
}

// Znajdź pierwszy węzeł o danej lokalnej nazwie w całym poddrzewie.
export function findDeep(node, name) {
  if (localName(node.name) === name) return node;
  for (const c of node.children) {
    const r = findDeep(c, name);
    if (r) return r;
  }
  return null;
}

export function text(node) {
  return node ? node.text : '';
}
