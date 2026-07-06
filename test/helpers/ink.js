// Helpers for testing Ink components (ink-testing-library).
//
// `keys` — raw sequences that `stdin.write(...)` sends to useInput.
// `press(stdin, seq)` types a sequence and waits for React to process the event
// (Ink parses input asynchronously). `frame(api)` returns the last frame with
// ANSI codes stripped — convenient for text assertions.
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

export const keys = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  enter: '\r',
  escape: '\x1b',
  slash: '/',
  tab: '\t',
};

export function strip(s) {
  return String(s == null ? '' : s).replace(ANSI, '');
}

// A small delay: lets (1) the useInput effect subscribe to stdin after the
// first render, (2) Ink distinguish a lone ESC from an arrow-key sequence.
const tick = (ms = 8) => new Promise((r) => setTimeout(r, ms));

// Let React process effects after the render (before sending the first key).
export const flush = () => tick();

// Press one or more keys (sequences), waiting for a re-render after each.
// The first `tick()` guarantees the useInput subscription is already active.
export async function press(stdin, ...seqs) {
  await tick();
  for (const s of seqs) {
    stdin.write(s);
    await tick();
  }
}

export function frame(api) {
  return strip(api.lastFrame());
}

// A static render (no interaction) at a GIVEN terminal width — needed for layout
// tests (Header, dividers), because ink-testing-library has a fixed
// columns=100. Returns an array of rows with ANSI codes stripped. Uses ink's
// `render` with a fake stdout of `cols` columns.
export async function renderFrame(element, cols = 80, rows = 30) {
  const { render } = await import('ink');
  let last = '';
  const stdout = {
    columns: cols, rows, isTTY: false,
    write(s) { last = s; return true; },
    on() {}, off() {}, removeListener() {},
  };
  // A fake stdin supporting raw mode — components using `useInput` (e.g.
  // DiffView) throw "Raw mode is not supported" without it. For components
  // without input (Header) it is simply ignored.
  const stdin = {
    isTTY: true, setRawMode() {}, setEncoding() {}, resume() {}, pause() {},
    ref() {}, unref() {}, read() { return null; },
    on() {}, off() {}, removeListener() {}, addListener() {},
  };
  const app = render(element, { stdout, stdin, patchConsole: false });
  await new Promise((r) => setImmediate(r));
  app.unmount();
  return strip(last).replace(/\n+$/g, '').split('\n');
}
