// Test panelu logu ekranu głównego: zawijanie (/wrap), przewijanie (scroll) i
// pilnowanie budżetu wierszy. Uruchom: node apps/cli/test/logpane-scroll.mjs
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render } = await import('ink');
const mod = await import('../src/components/LogPane.jsx');
const LogPane = mod.default;
const { buildVlines } = mod;

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');
function fakeStdout(columns, rows = 40) {
  let last = '';
  return { columns, rows, isTTY: false, write(s) { last = s; return true; }, on() {}, off() {}, removeListener() {}, get last() { return last; } };
}

const now = Date.now();
const log = Array.from({ length: 12 }, (_, i) => ({
  Id: i + 1, TS: now, Color: i % 4 === 0 ? '#F00' : '#2A2',
  Text: i % 3 === 0
    ? `Wyślij ✓ — 3/0/templates/snippets/component-${i}-with-a-fairly-long-name.liquid`
    : `Zdarzenie ${i + 1}`,
}));

const ROWS = 8;

async function frame(cols, wrap, scroll) {
  const out = fakeStdout(cols);
  const vlines = buildVlines(log, wrap, cols);
  const app = render(React.createElement(LogPane, { vlines, rows: ROWS, scroll }), { stdout: out, patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  return { lines: strip(out.last).replace(/\n+$/g, '').split('\n'), total: vlines.length };
}

async function show(title, cols, wrap, scroll) {
  const { lines, total } = await frame(cols, wrap, scroll);
  console.log(`\n### ${title} · cols=${cols} wrap=${wrap} scroll=${scroll} · vlines=${total} budżet=${ROWS} → ${lines.length} ###`);
  lines.forEach((l, i) => console.log(String(i).padStart(2) + '|' + l));
  if (lines.length > ROWS) console.log(`!!! PRZEKROCZONO BUDŻET (${lines.length} > ${ROWS})`);
}

// maxScroll jak w App.jsx (+1 na wskaźnik „↓")
const maxScroll = (wrap, cols) => {
  const n = buildVlines(log, wrap, cols).length;
  return n > ROWS ? n - ROWS + 1 : 0;
};

await show('dół, bez zawijania', 70, false, 0);
await show('przewinięte w górę, bez zawijania', 70, false, 3);
await show('SAMA GÓRA, bez zawijania', 70, false, maxScroll(false, 70));
await show('dół, zawijanie', 46, true, 0);
await show('przewinięte w górę, zawijanie', 46, true, 5);
await show('SAMA GÓRA, zawijanie', 46, true, maxScroll(true, 46));
process.exit(0);
