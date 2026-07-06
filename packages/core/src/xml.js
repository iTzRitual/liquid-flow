// Minimal XML parser and serializer sufficient for the iSklep24 SOAP contract.
// No external dependencies.

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

// Parses XML into a tree of objects: { name, attrs, children:[], text }
export function parseXml(xml) {
  // strip the XML declaration and comments; CDATA sections are not supported —
  // Comarch does not send them, but they would land in text without decoding.
  xml = xml.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  // Attributes only with double quotes ("..."); single quotes ('...') are not supported
  // — the ASMX contract always uses ", so this is not a problem in practice.
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

// Ignoring namespaces — matching on the local part of the name.
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

// Find the first node with the given local name anywhere in the subtree.
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
