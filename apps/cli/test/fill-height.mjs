// Próbka zasady layoutu „wypełnij wysokość": kolumna o stałej wysokości
// (rows-1), nagłówek, obszar logu flexGrow z justify flex-end (wpisy hugują
// dół), divider, input. Sprawdza, że input ląduje na dole i nic nie wystaje.
// Uruchom: node apps/cli/test/fill-height.mjs
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render, Box, Text } = await import('ink');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');
function fakeStdout(columns, rows) {
  let last = '';
  return { columns, rows, isTTY: false, write(s) { last = s; return true; }, on() {}, off() {}, removeListener() {}, get last() { return last; } };
}

function Probe({ rows, cols, nLogs }) {
  const HEADER = 7;
  const logRows = Math.max(3, rows - HEADER - 3); // divider+input+zapas
  const logs = Array.from({ length: nLogs }, (_, i) => `log ${i + 1}`).slice(-logRows);
  return React.createElement(Box, { flexDirection: 'column', height: rows - 1 },
    React.createElement(Box, { height: HEADER }, React.createElement(Text, null, '[HEADER]')),
    React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    React.createElement(Box, { flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' },
      logs.map((l, i) => React.createElement(Text, { key: i }, l))),
    React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    React.createElement(Box, null, React.createElement(Text, { color: 'yellow' }, '› input'))
  );
}

async function run(rows, cols, nLogs) {
  const out = fakeStdout(cols, rows);
  const app = render(React.createElement(Probe, { rows, cols, nLogs }), { stdout: out, patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  const lines = strip(out.last).replace(/\n+$/g, '').split('\n');
  const inputRow = lines.findIndex((l) => l.includes('input'));
  console.log(`\n# rows=${rows} cols=${cols} logi=${nLogs} → wyrenderowano ${lines.length} wierszy, input w wierszu ${inputRow}`);
  lines.forEach((l, i) => console.log(String(i).padStart(2) + '|' + l));
  if (lines.length > rows) console.log(`!!! PRZEKROCZONO ${lines.length} > ${rows}`);
}

await run(30, 40, 3);   // dużo miejsca, mało logów → input na dole, pusto u góry
await run(30, 40, 50);  // dużo logów → log wypełnia, input na dole
process.exit(0);
