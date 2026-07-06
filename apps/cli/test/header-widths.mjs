// Renders the header at various terminal widths.
// Run: node apps/cli/test/header-widths.mjs   (from the repo root)
// Renders <Header/> to a fake stdout with a given column count and prints the
// frame with ANSI codes stripped — lets you check wrapping/alignment without a TTY.
import { register } from 'tsx/esm/api';
register();
const React = (await import('react')).default;
const { render } = await import('ink');
const Header = (await import('../src/components/Header.jsx')).default;
const { translationsFor } = await import('@liquidflow/core');
const t = translationsFor('pl');

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
  const app = render(React.createElement(Header, { state, git, mismatches, cols: columns, t }), { stdout: out, patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  return strip(out.last);
}

for (const w of [120, 90, 76, 60, 50, 40, 30]) {
  const frame = await frameAt(w);
  const ruler = '─'.repeat(w);
  console.log(`\n### szerokość = ${w} ###`);
  console.log(ruler);
  // trim/show numbered lines, to spot any wrapping or misalignment
  frame.replace(/\s+$/g, '').split('\n').forEach((ln, i) => {
    console.log(String(i).padStart(2) + '|' + ln);
  });
  console.log(ruler);
}
process.exit(0);
