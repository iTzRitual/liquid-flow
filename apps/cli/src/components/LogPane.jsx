import React from 'react';
import { Box, Text } from 'ink';
import wrapAnsi from 'wrap-ansi';

// Mapowanie kolorów z rdzenia (hex) na nazwy kolorów Ink.
function inkColor(hex) {
  switch ((hex || '').toUpperCase()) {
    case '#F00': return 'red';
    case '#2A2': return 'green';
    case '#FFF': return 'white';
    default: return 'gray';
  }
}

function hhmmss(ts) {
  try { return new Date(ts).toLocaleTimeString('pl-PL', { hour12: false }); }
  catch { return ''; }
}

// Panel logu na żywo. Wpisy ZAWIJAJĄ się (wrap="wrap"), żeby długie linie były
// czytelne w całości także w wąskim oknie. Żeby panel nie przerósł budżetu
// `rows` (a wtedy Ink dokleja kopię layoutu = „rozdwojenie"), liczymy rzeczywistą
// wysokość każdego wpisu po zawinięciu — tą samą funkcją i parametrami co Ink
// (`wrap-ansi`, hard) — i dobieramy od najnowszego tyle wpisów, ile się mieści.
// `height` + `overflow:hidden` to bezpiecznik na skrajny przypadek (pojedynczy
// wpis dłuższy niż cały budżet).
export default function LogPane({ log, rows = 10, cols = 80 }) {
  const w = Math.max(8, (cols || 80) - 2); // Box ma paddingX={1} → -2 kolumny
  const budget = Math.max(1, rows);

  const wrappedRows = (e) =>
    wrapAnsi(`${hhmmss(e.TS)} ${e.Text}`, w, { trim: false, hard: true }).split('\n').length;

  // od najnowszego wstecz: najnowszy zawsze pokazujemy, starsze tylko gdy się mieszczą
  const picked = [];
  let used = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    const h = wrappedRows(log[i]);
    if (picked.length > 0 && used + h > budget) break;
    picked.push(log[i]);
    used += h;
  }
  picked.reverse();
  const height = Math.max(1, Math.min(budget, used));

  return (
    <Box flexDirection="column" paddingX={1} height={height} overflow="hidden">
      {picked.length === 0
        ? <Text color="gray" dimColor>— pusto —</Text>
        : picked.map((e) => (
            <Text key={e.Id} color={inkColor(e.Color)} wrap="wrap">
              <Text color="gray">{hhmmss(e.TS)} </Text>{e.Text}
            </Text>
          ))}
    </Box>
  );
}
