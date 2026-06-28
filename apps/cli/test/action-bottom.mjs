// Weryfikacja nowego layoutu: ekrany (picker/conflicts) i paleta przyklejone do
// DOŁU, z logiem jako kontekstem nad nimi. Sprawdza: (1) nic nie wystaje poza
// wysokość okna, (2) ostatni wiersz treści to ekran/paleta (jest nisko, nie pod
// nagłówkiem), (3) log jest widoczny nad ekranem. Replikuje liczenie z App.jsx.
// Uruchom: node apps/cli/test/action-bottom.mjs
// FORCE_COLOR (przed importem ink/chalk) — bez kolorów `dimColor` nie emituje
// kodu SGR, więc asercja wyszarzenia logu (dim) nie mogłaby go wykryć.
process.env.FORCE_COLOR = process.env.FORCE_COLOR || '3';
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render, Box, Text } = await import('ink');
const Header = (await import('../src/components/Header.jsx')).default;
const mod = await import('../src/components/LogPane.jsx');
const LogPane = mod.default; const { buildVlines } = mod;
const Picker = (await import('../src/components/Picker.jsx')).default;
const CommandPalette = (await import('../src/components/CommandPalette.jsx')).default;
const { headerLayout } = await import('../src/layout.js');
const { translationsFor } = await import('@liquidflow/core');
const t = translationsFor('pl');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');
const fakeStdout = (columns, rows) => { let last=''; return { columns, rows, isTTY:false, write(s){last=s;return true;}, on(){}, off(){}, removeListener(){}, get last(){return last;} }; };
const { PassThrough } = await import('node:stream');
const fakeStdin = () => { const s = new PassThrough(); s.isTTY = true; s.setRawMode = () => {}; s.ref = () => {}; s.unref = () => {}; return s; };

const state = { currentShop: { Name: 'walter', Url: 'https://walter.comarch-esklep.pl' }, currentTemplate: { Id: 3, Name: 'new' } };
const git = { active: true, autoCommit: true, autoPush: false };

// Liczenie 1:1 z App.jsx, ale przez layout.js (degradacja nagłówka z wysokością).
function layoutOverlay(termRows, cols, nItems, nLogs) {
  const mode = { type: 'picker', items: Array.from({ length: nItems }) };
  const hl = headerLayout({ termRows, termCols: cols, mode });
  const HEADER = hl.height;
  const overlayAvail = Math.max(1, termRows - HEADER); // root = termRows (pełna wysokość)
  const natural = nItems + 4;
  const ovRows = Math.min(natural, overlayAvail);
  const ovMax = Math.max(1, ovRows - 4);
  const ovLogRows = Math.max(0, overlayAvail - ovRows); // brak spacera nad ekranem
  const ovShowLog = ovLogRows >= 2 && nLogs > 0;
  return { headerMode: hl.mode, HEADER, ovMax, ovLogRows, ovShowLog };
}

async function runPicker(rows, cols, nItems, nLogs) {
  const { headerMode, ovMax, ovLogRows, ovShowLog } = layoutOverlay(rows, cols, nItems, nLogs);
  const items = Array.from({ length: nItems }, (_, i) => ({ label: `pozycja ${i + 1}`, value: i }));
  const log = Array.from({ length: nLogs }, (_, i) => ({ Id: i + 1, TS: Date.now(), Color: '#2A2', Text: `log ${i + 1}` }));
  const vlines = buildVlines(log, false, cols);
  const wrap = (node) =>
    React.createElement(Box, { flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' },
      ovShowLog ? React.createElement(LogPane, { vlines, rows: ovLogRows, scroll: 0, t, dim: true }) : null,
      node);
  const tree = React.createElement(Box, { flexDirection: 'column', height: rows },
    headerMode !== 'none' && React.createElement(Header, { state, git, mismatches: [], cols, t, compact: headerMode === 'compact' }),
    headerMode !== 'none' && React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    wrap(React.createElement(Picker, { title: 'Wybierz', items, onSelect(){}, onCancel(){}, maxRows: ovMax, t })));
  const out = fakeStdout(cols, rows);
  const app = render(tree, { stdout: out, stdin: fakeStdin(), patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  const raw = out.last;
  const lines = strip(raw).replace(/\n+$/g, '').split('\n');
  const overflow = lines.length > rows;
  const logIdx = lines.map((l, i) => (/log \d/.test(l) ? i : -1)).filter((i) => i >= 0);
  const hasLog = logIdx.length > 0;
  const screenIdx = lines.findIndex((l) => /╭/.test(l)); // górna ramka ekranu
  // ekran lgnie WPROST pod log — tuż nad górną ramką ma być treść logu, nie pusty
  // wiersz (spacer został usunięty). `flush` = brak pustej linii między logiem a ramką.
  const flush = hasLog && screenIdx > 0 && (lines[screenIdx - 1] || '').trim() !== '';
  const dimmed = raw.split("\n").some((l) => /log \d/.test(strip(l)) && /\x1b\[2m/.test(l)); // log renderowany z dimColor
  const last = lines[lines.length - 1] || '';
  const bottomIsScreen = /[╰─]/.test(last) || /wybór|Enter/.test(last);
  // BRAK pustego wiersza tuż pod górnym dividerem nagłówka — log lgnie pod nagłówek
  // jak na ekranie podstawowym (regresja „gap u góry”). Pierwszy pełnowymiarowy
  // wiersz `─` to divider nagłówka; następny wiersz musi być treścią logu (wpis
  // lub wskaźnik „↑ starszych”), a nie pusty.
  const divIdx = lines.findIndex((l) => /^─+$/.test(l.trim()));
  const noTopGap = hasLog && divIdx >= 0 && (lines[divIdx + 1] || '').trim() !== '';
  console.log(`picker rows=${rows} items=${nItems} logi=${nLogs} header=${headerMode}: ${lines.length}w ${overflow ? 'OVERFLOW!' : 'ok'}; log=${hasLog} topGap=${!noTopGap} flush=${flush} dim=${dimmed}; dół=ekran:${bottomIsScreen}`);
  if (overflow) lines.forEach((l, i) => console.log(String(i).padStart(2) + '|' + l));
  // Zawsze: brak przepełnienia i ekran przyklejony do dołu. Log/flush/dim/noTopGap
  // tylko, gdy log jest widoczny (przy niskim oknie jest wypełniaczem i znika).
  const base = !overflow && bottomIsScreen;
  return ovShowLog ? (base && hasLog && flush && dimmed && noTopGap) : base;
}

async function runPalette(rows, cols, nCmds, nLogs) {
  const fillHeight = rows >= 16;
  const HEADERc = 8;
  const logRows = Math.max(3, rows - HEADERc - 3); // root = termRows
  const showLogWithPalette = fillHeight && nLogs > 0 && logRows >= 10;
  const paletteCap = Math.max(3, Math.min(nCmds, logRows - 4));
  const paletteLogRows = Math.max(1, logRows - paletteCap);
  const items = Array.from({ length: nCmds }, (_, i) => ({ name: `/cmd${i + 1}`, desc: 'opis' }));
  const log = Array.from({ length: nLogs }, (_, i) => ({ Id: i + 1, TS: Date.now(), Color: '#2A2', Text: `log ${i + 1}` }));
  const vlines = buildVlines(log, false, cols);
  // Nowy układ aktywny: log > divider > podpowiedzi > input (bez spacera, bez
  // dolnego dividera). Divider tuż pod logiem jest siblingiem flex-boxa logu.
  const tree = React.createElement(Box, { flexDirection: 'column', height: fillHeight ? rows : undefined },
    React.createElement(Header, { state, git, mismatches: [], cols, t }),
    React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)),
    React.createElement(Box, { flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' },
      showLogWithPalette ? React.createElement(LogPane, { vlines, rows: paletteLogRows, scroll: 0, t, dim: true }) : null),
    showLogWithPalette ? React.createElement(Text, { color: 'blue' }, '─'.repeat(cols)) : null,
    React.createElement(CommandPalette, { items, index: 0, maxRows: showLogWithPalette ? paletteCap : Math.max(3, rows - HEADERc - 1), t }),
    React.createElement(Box, null, React.createElement(Text, { color: 'yellow' }, '› /')));
  const out = fakeStdout(cols, rows);
  const app = render(tree, { stdout: out, stdin: fakeStdin(), patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  const raw = out.last;
  const lines = strip(raw).replace(/\n+$/g, '').split('\n');
  const overflow = lines.length > rows;
  const hasLog = lines.some((l) => /log \d/.test(l));
  const cmdIdx = lines.findIndex((l) => /\/cmd/.test(l));
  const hasCmd = cmdIdx >= 0;
  // tuż nad pierwszą podpowiedzią ma być divider (──), nie pusty wiersz
  const dividerAbove = hasLog && cmdIdx > 0 && /^─+$/.test((lines[cmdIdx - 1] || '').trim());
  const dimmed = raw.split("\n").some((l) => /log \d/.test(strip(l)) && /\x1b\[2m/.test(l));
  // ostatnia treść to input (podpowiedzi bezpośrednio nad nim, bez dolnego dividera)
  const last = lines[lines.length - 1] || '';
  const inputLast = /›\s*\/$/.test(last.trim());
  console.log(`palette rows=${rows} cmds=${nCmds} logi=${nLogs}: ${lines.length}w ${overflow ? 'OVERFLOW!' : 'ok'}; log=${hasLog} div=${dividerAbove} dim=${dimmed} paleta=${hasCmd} input-na-dole=${inputLast}`);
  if (overflow) lines.forEach((l, i) => console.log(String(i).padStart(2) + '|' + l));
  if (!fillHeight) return !overflow && hasCmd;
  return !overflow && hasCmd && hasLog && dividerAbove && dimmed && inputLast;
}

let ok = true;
ok = await runPalette(30, 80, 8, 40) && ok;  // slash: log nad, paleta przy dole
ok = await runPalette(24, 80, 8, 5) && ok;   // typowe okno + paleta + log
ok = await runPicker(40, 80, 4, 30) && ok;   // krótki picker, dużo logów → duży log nad, picker na dole
ok = await runPicker(40, 80, 60, 30) && ok;  // długi picker → windowuje, log minimalny
ok = await runPicker(24, 80, 5, 10) && ok;   // typowe okno
ok = await runPicker(14, 80, 5, 10) && ok;   // niskie okno → nagłówek compact, ekran na dole
ok = await runPicker(9, 80, 5, 0) && ok;     // bardzo niskie → nagłówek ukryty, ekran wypełnia
console.log(ok ? '\nWSZYSTKO OK' : '\nBŁĄD');
process.exit(ok ? 0 : 1);
