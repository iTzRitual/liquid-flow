// A faithful test of the input mode layout: a real Header + LogPane in a flexGrow
// (flex-end) area, just like in App.jsx. Checks that the log sits against the top
// divider (no blank line) and that nothing overflows the window height.
// Run: node apps/cli/test/fill-height.mjs
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render, Box, Text } = await import('ink');
const Header = (await import('../src/components/Header.jsx')).default;
const mod = await import('../src/components/LogPane.jsx');
const LogPane = mod.default;
const { buildVlines } = mod;
const { translationsFor } = await import('@liquidflow/core');
const t = translationsFor('pl');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');
function fakeStdout(columns, rows) {
  let last = '';
  return { columns, rows, isTTY: false, write(s) { last = s; return true; }, on() {}, off() {}, removeListener() {}, get last() { return last; } };
}

const state = { currentShop: { Name: 'walter', Url: 'https://walter.comarch-esklep.pl' }, currentTemplate: { Id: 3, Name: 'new' } };
const git = { active: true, autoCommit: true, autoPush: false };
const mismatches = [1, 2, 3, 4];

const HEADER = 8; // the candidate value for App.jsx (logo 7 + top divider 1)

function Probe({ rows, cols, nLogs }) {
  const logRows = Math.max(3, rows - HEADER - 3); // root = termRows; +1 za bottomSpacer (full header)
  const log = Array.from({ length: nLogs }, (_, i) => ({ Id: i + 1, TS: Date.now(), Color: '#2A2', Text: `log ${i + 1}` }));
  const vlines = buildVlines(log, false, cols);
  return React.createElement(Box, { flexDirection: 'column', height: rows },
    React.createElement(Header, { state, git, mismatches, cols, t }),
    React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    React.createElement(Box, { flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' },
      React.createElement(LogPane, { vlines, rows: logRows, scroll: 0, t })),
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
  const topDiv = lines.findIndex((l) => /^─+$/.test(l));
  const afterDiv = lines[topDiv + 1] || '';
  const gap = afterDiv.trim() === '';
  console.log(`\n# rows=${rows} cols=${cols} logi=${nLogs} → ${lines.length} wierszy; wiersz po górnym dividerze: ${JSON.stringify(afterDiv.slice(0, 20))} ${gap ? '← PUSTY (gap!)' : 'OK'}`);
  lines.forEach((l, i) => console.log(String(i).padStart(2) + '|' + l));
  if (lines.length > rows) console.log(`!!! PRZEKROCZONO ${lines.length} > ${rows}`);
}

await run(30, 70, 50); // many logs → they should sit against the top divider
process.exit(0);
