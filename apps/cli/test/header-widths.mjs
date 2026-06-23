// Test renderu nagłówka na różnych szerokościach terminala.
// Uruchom: node apps/cli/test/header-widths.mjs   (z katalogu repo)
// Renderuje <Header/> do sztucznego stdout o zadanej liczbie kolumn i wypisuje
// klatkę z usuniętymi kodami ANSI — pozwala sprawdzić zawijanie/wyrównanie bez TTY.
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render } = await import('ink');
const Header = (await import('../src/components/Header.jsx')).default;

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');

function fakeStdout(columns, rows = 30) {
  let last = '';
  return {
    columns, rows, isTTY: false,
    write(s) { last = s; return true; },
    on() {}, off() {}, removeListener() {},
    get last() { return last; },
  };
}

const state = {
  currentShop: { Name: 'walter', Url: 'https://walter.comarch-esklep.pl' },
  currentTemplate: { Id: 3, Name: 'new' },
};
const git = { active: true, autoCommit: true, autoPush: false };
const mismatches = [1, 2, 3, 4];

async function frameAt(columns) {
  const out = fakeStdout(columns);
  const app = render(React.createElement(Header, { state, git, mismatches, cols: columns }), { stdout: out, patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  return strip(out.last);
}

for (const w of [120, 90, 76, 60, 50, 40, 30]) {
  const frame = await frameAt(w);
  const ruler = '─'.repeat(w);
  console.log(`\n### szerokość = ${w} ###`);
  console.log(ruler);
  // przytnij/pokaż linie z numerem, by widzieć ewentualne zawijanie i wyrównanie
  frame.replace(/\s+$/g, '').split('\n').forEach((ln, i) => {
    console.log(String(i).padStart(2) + '|' + ln);
  });
  console.log(ruler);
}
process.exit(0);
