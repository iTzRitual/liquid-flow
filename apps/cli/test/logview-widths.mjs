// Test renderu pełnego widoku logu (/log → LogView) na różnych szerokościach.
// Uruchom: node apps/cli/test/logview-widths.mjs
// Weryfikuje, że długie wpisy się ZAWIJAJĄ (czytasz całość) oraz że zawartość
// ramki nie przekracza zadanego budżetu wierszy.
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render } = await import('ink');
const LogView = (await import('../src/components/LogView.jsx')).default;

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');

// LogView używa useInput → potrzebny stdin z (atrapą) raw mode.
const fakeStdin = {
  isTTY: true, setRawMode() {}, setEncoding() {}, ref() {}, unref() {},
  on() {}, off() {}, addListener() {}, removeListener() {}, read() { return null; },
  resume() {}, pause() {},
};
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

const ROWS = 12; // budżet całego widoku (z ramką/tytułem/stopką)

async function frameAt(columns) {
  const out = fakeStdout(columns);
  const app = render(React.createElement(LogView, { log, rows: ROWS, cols: columns, onCancel() {} }), { stdout: out, stdin: fakeStdin, patchConsole: false, exitOnCtrlC: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  return strip(out.last).replace(/\n+$/g, '');
}

for (const wdt of [120, 70, 50, 36]) {
  const frame = await frameAt(wdt);
  const lines = frame.split('\n');
  console.log(`\n### szerokość = ${wdt} · budżet=${ROWS} · wyrenderowano=${lines.length} ###`);
  lines.forEach((ln, i) => console.log(String(i).padStart(2) + '|' + ln));
  if (lines.length > ROWS) console.log(`!!! PRZEKROCZONO BUDŻET (${lines.length} > ${ROWS})`);
}
process.exit(0);
