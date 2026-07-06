// A quick render of <ConnectList/> to a fake stdout (no TTY) — checks the layout
// of the list + action footer and the absence of a runtime error. Run: node apps/cli/test/connectlist-render.mjs
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render } = await import('ink');
const ConnectList = (await import('../src/components/ConnectList.jsx')).default;
const { translationsFor } = await import('@liquidflow/core');
const t = translationsFor('pl');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');
function fakeStdout(columns = 80, rows = 24) {
  let last = '';
  return { columns, rows, isTTY: false, write(s) { last = s; return true; }, on() {}, off() {}, removeListener() {}, get last() { return last; } };
}
// A fake stdin supporting raw mode — without it useInput throws "Raw mode…".
const { PassThrough } = await import('node:stream');
function fakeStdin() {
  const s = new PassThrough();
  s.isTTY = true; s.setRawMode = () => {}; s.ref = () => {}; s.unref = () => {};
  return s;
}

async function frame(props) {
  const out = fakeStdout();
  const app = render(React.createElement(ConnectList, { t, maxRows: 12, onShop() {}, onAction() {}, ...props }), { stdout: out, stdin: fakeStdin(), patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  return strip(out.last);
}

const shops = [
  { label: 'walter', hint: '● bieżący', shop: {} },
  { label: 'sklep-demo', hint: 'https://demo.comarch-esklep.pl', shop: {} },
];
const actions = [
  { key: 'logout', label: t.DisconnectSession },
  { key: 'add', label: t.AddConnectionShort },
  { key: 'remove', label: t.RemoveShopTitle },
];

console.log('=== połączony (3 akcje) ===');
console.log(await frame({ title: t.ConnectToShop, shops, actions }));
console.log('\n=== świeży start (brak sklepów, tylko Dodaj) ===');
console.log(await frame({ title: t.ConnectToShop, shops: [], actions: [{ key: 'add', label: t.AddConnectionShort }] }));
