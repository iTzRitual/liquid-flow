// Pomocniki do testów komponentów Ink (ink-testing-library).
//
// `keys` — surowe sekwencje, które `stdin.write(...)` wysyła do useInput.
// `press(stdin, seq)` wpisuje sekwencję i czeka, aż React przetworzy zdarzenie
// (ink parsuje wejście asynchronicznie). `frame(api)` zwraca ostatnią klatkę bez
// kodów ANSI — wygodne do asercji na tekście.
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

// Drobne opóźnienie: pozwala (1) efektowi useInput zasubskrybować stdin po
// pierwszym renderze, (2) inkowi rozróżnić samotny ESC od sekwencji strzałki.
const tick = (ms = 8) => new Promise((r) => setTimeout(r, ms));

// Wpuść React do przetworzenia efektów po renderze (zanim wyślemy pierwszy klawisz).
export const flush = () => tick();

// Wciśnij jeden lub więcej klawiszy (sekwencji), czekając po każdym na re-render.
// Pierwszy `tick()` gwarantuje, że subskrypcja useInput już działa.
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

// Render statyczny (bez interakcji) o ZADANEJ szerokości terminala — potrzebny
// do testów layoutu (Header, dividery), bo ink-testing-library ma sztywne
// columns=100. Zwraca tablicę wierszy bez kodów ANSI. Używa `render` z ink z
// atrapą stdout o `cols` kolumnach.
export async function renderFrame(element, cols = 80, rows = 30) {
  const { render } = await import('ink');
  let last = '';
  const stdout = {
    columns: cols, rows, isTTY: false,
    write(s) { last = s; return true; },
    on() {}, off() {}, removeListener() {},
  };
  // Atrapa stdin z obsługą raw-mode — komponenty używające `useInput` (np.
  // DiffView) rzucają „Raw mode is not supported" bez tego. Dla komponentów bez
  // wejścia (Header) jest po prostu ignorowana.
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
