// Test renderu panelu logu na różnych szerokościach.
// Uruchom: node apps/cli/test/log-widths.mjs
// Weryfikuje, że wpisy się ZAWIJAJĄ (nie kropki) oraz że panel nie przekracza
// budżetu `rows` (inaczej Ink dubluje layout).
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render } = await import('ink');
const LogPane = (await import('../src/components/LogPane.jsx')).default;

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');

function fakeStdout(columns, rows = 40) {
  let last = '';
  return { columns, rows, isTTY: false, write(s) { last = s; return true; }, on() {}, off() {}, removeListener() {}, get last() { return last; } };
}

const now = Date.now();
const log = [
  { Id: 1, TS: now, Color: '#2A2', Text: 'Połączono ze sklepem: walter (zapisane hasło)' },
  { Id: 2, TS: now, Color: '#FFF', Text: 'Wybrano szablon: new [3]' },
  { Id: 3, TS: now, Color: '#2A2', Text: 'Wyślij ✓ — 3/0/templates/snippets/very-long-file-name-component.liquid' },
  { Id: 4, TS: now, Color: '#F00', Text: 'Błąd: ścieżka zbyt długa — 3/0/templates/sections/another/really/deeply/nested/path.liquid' },
  { Id: 5, TS: now, Color: '#2A2', Text: 'Synchronizacja aktywna — hot-reload (new)' },
];

const ROWS_BUDGET = 9;

async function frameAt(columns) {
  const out = fakeStdout(columns);
  const app = render(React.createElement(LogPane, { log, rows: ROWS_BUDGET, cols: columns }), { stdout: out, patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  return strip(out.last).replace(/\n+$/g, '');
}

for (const wdt of [120, 80, 60, 40, 30]) {
  const frame = await frameAt(wdt);
  const lines = frame.split('\n');
  console.log(`\n### szerokość = ${wdt} · budżet=${ROWS_BUDGET} wierszy · wyrenderowano=${lines.length} ###`);
  console.log('─'.repeat(wdt));
  lines.forEach((ln, i) => console.log(String(i).padStart(2) + '|' + ln));
  console.log('─'.repeat(wdt));
  if (lines.length > ROWS_BUDGET) console.log(`!!! PRZEKROCZONO BUDŻET (${lines.length} > ${ROWS_BUDGET})`);
}
process.exit(0);
