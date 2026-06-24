// Weryfikacja nowego layoutu: ekrany (picker/conflicts) i paleta przyklejone do
// DOŁU, z logiem jako kontekstem nad nimi. Sprawdza: (1) nic nie wystaje poza
// wysokość okna, (2) ostatni wiersz treści to ekran/paleta (jest nisko, nie pod
// nagłówkiem), (3) log jest widoczny nad ekranem. Replikuje liczenie z App.jsx.
// Uruchom: node apps/cli/test/action-bottom.mjs
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render, Box, Text } = await import('ink');
const Header = (await import('../src/components/Header.jsx')).default;
const mod = await import('../src/components/LogPane.jsx');
const LogPane = mod.default; const { buildVlines } = mod;
const Picker = (await import('../src/components/Picker.jsx')).default;
const CommandPalette = (await import('../src/components/CommandPalette.jsx')).default;
const { translationsFor } = await import('@liquidflow/core');
const t = translationsFor('pl');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');
const fakeStdout = (columns, rows) => { let last=''; return { columns, rows, isTTY:false, write(s){last=s;return true;}, on(){}, off(){}, removeListener(){}, get last(){return last;} }; };
const { PassThrough } = await import('node:stream');
const fakeStdin = () => { const s = new PassThrough(); s.isTTY = true; s.setRawMode = () => {}; s.ref = () => {}; s.unref = () => {}; return s; };

const state = { currentShop: { Name: 'walter', Url: 'https://walter.comarch-esklep.pl' }, currentTemplate: { Id: 3, Name: 'new' } };
const git = { active: true, autoCommit: true, autoPush: false };
const HEADER = 8;

function layoutOverlay(termRows, nItems, nLogs) {
  const fillHeight = termRows >= 16;
  const overlayAvail = Math.max(3, termRows - HEADER - 2);
  const natural = nItems + 4;
  const ovShowLog = fillHeight && nLogs > 0 && overlayAvail >= 12;
  const ovReserve = ovShowLog ? 4 : 0;
  const ovRows = Math.min(natural, overlayAvail - ovReserve);
  const ovMax = Math.max(3, ovRows - 4);
  const ovLogRows = ovShowLog ? Math.max(0, overlayAvail - ovRows) : 0;
  return { fillHeight, ovMax, ovLogRows };
}

async function runPicker(rows, cols, nItems, nLogs) {
  const { fillHeight, ovMax, ovLogRows } = layoutOverlay(rows, nItems, nLogs);
  const items = Array.from({ length: nItems }, (_, i) => ({ label: `pozycja ${i + 1}`, value: i }));
  const log = Array.from({ length: nLogs }, (_, i) => ({ Id: i + 1, TS: Date.now(), Color: '#2A2', Text: `log ${i + 1}` }));
  const vlines = buildVlines(log, false, cols);
  const wrap = (node) => fillHeight
    ? React.createElement(Box, { flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' },
        ovLogRows > 0 && log.length > 0 ? React.createElement(LogPane, { vlines, rows: ovLogRows, scroll: 0, t }) : null,
        node)
    : node;
  const tree = React.createElement(Box, { flexDirection: 'column', height: fillHeight ? rows - 1 : undefined },
    React.createElement(Header, { state, git, mismatches: [], cols, t }),
    React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    wrap(React.createElement(Picker, { title: 'Wybierz', items, onSelect(){}, onCancel(){}, maxRows: ovMax, t })));
  const out = fakeStdout(cols, rows);
  const app = render(tree, { stdout: out, stdin: fakeStdin(), patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  const lines = strip(out.last).replace(/\n+$/g, '').split('\n');
  const overflow = lines.length > rows;
  const hasLog = lines.some((l) => /log \d/.test(l));
  const last = lines[lines.length - 1] || '';
  // ostatni wiersz powinien należeć do ekranu (ramka ╰ lub pomoc), nie być pusty
  const bottomIsScreen = /[╰─]/.test(last) || /wybór|Enter/.test(last);
  console.log(`picker rows=${rows} items=${nItems} logi=${nLogs} fill=${fillHeight}: ${lines.length}w ${overflow ? 'OVERFLOW!' : 'ok'}; log nad ekranem=${hasLog}; dół=ekran:${bottomIsScreen}`);
  if (overflow && fillHeight) lines.forEach((l, i) => console.log(String(i).padStart(2) + '|' + l));
  // Asercje dotyczą tylko trybu fillHeight (>=16 wierszy) — to ścieżka zmieniona.
  // Niskie okno = naturalny przepływ (legacy, identyczny jak przed zmianą).
  if (!fillHeight) return true;
  return !overflow && bottomIsScreen && hasLog;
}

async function runPalette(rows, cols, nCmds, nLogs) {
  const fillHeight = rows >= 16;
  const HEADERc = 8;
  const logRows = Math.max(3, rows - HEADERc - 3);
  const showLogWithPalette = fillHeight && nLogs > 0 && logRows >= 10;
  const paletteCap = Math.max(3, Math.min(nCmds, logRows - 4));
  const paletteLogRows = Math.max(1, logRows - paletteCap);
  const items = Array.from({ length: nCmds }, (_, i) => ({ name: `/cmd${i + 1}`, desc: 'opis' }));
  const log = Array.from({ length: nLogs }, (_, i) => ({ Id: i + 1, TS: Date.now(), Color: '#2A2', Text: `log ${i + 1}` }));
  const vlines = buildVlines(log, false, cols);
  const tree = React.createElement(Box, { flexDirection: 'column', height: fillHeight ? rows - 1 : undefined },
    React.createElement(Header, { state, git, mismatches: [], cols, t }),
    React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    React.createElement(Box, { flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' },
      showLogWithPalette ? React.createElement(LogPane, { vlines, rows: paletteLogRows, scroll: 0, t }) : null,
      React.createElement(CommandPalette, { items, index: 0, maxRows: showLogWithPalette ? paletteCap : Math.max(3, rows - HEADERc - 2), t })),
    React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    React.createElement(Box, null, React.createElement(Text, { color: 'yellow' }, '› /')));
  const out = fakeStdout(cols, rows);
  const app = render(tree, { stdout: out, stdin: fakeStdin(), patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  const lines = strip(out.last).replace(/\n+$/g, '').split('\n');
  const overflow = lines.length > rows;
  const hasLog = lines.some((l) => /log \d/.test(l));
  const hasCmd = lines.some((l) => /\/cmd/.test(l));
  console.log(`palette rows=${rows} cmds=${nCmds} logi=${nLogs}: ${lines.length}w ${overflow ? 'OVERFLOW!' : 'ok'}; log=${hasLog}; paleta=${hasCmd}`);
  if (overflow) lines.forEach((l, i) => console.log(String(i).padStart(2) + '|' + l));
  return !overflow && hasCmd && (fillHeight ? hasLog : true);
}

let ok = true;
ok = await runPalette(30, 80, 8, 40) && ok;  // slash: log nad, paleta przy dole
ok = await runPalette(24, 80, 8, 5) && ok;   // typowe okno + paleta + log
ok = await runPicker(40, 80, 4, 30) && ok;   // krótki picker, dużo logów → duży log nad, picker na dole
ok = await runPicker(40, 80, 60, 30) && ok;  // długi picker → windowuje, log minimalny
ok = await runPicker(24, 80, 5, 10) && ok;   // typowe okno
ok = await runPicker(14, 80, 5, 10) && ok;   // niskie okno → naturalny przepływ (bez fill)
console.log(ok ? '\nWSZYSTKO OK' : '\nBŁĄD');
process.exit(ok ? 0 : 1);
