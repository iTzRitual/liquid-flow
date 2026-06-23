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

// Buduje „wizualne wiersze" logu (jednostka przewijania).
//  - wrap=false (domyślnie): każdy wpis = 1 wiersz (obcinany przy renderze),
//  - wrap=true (/wrap): długie wpisy zawijają się na kilka wierszy — alternatywny
//    tryb, w którym czytasz całość bez otwierania osobnego ekranu.
// Liczone tą samą `wrap-ansi`+hard co Ink, więc render zgadza się co do wiersza.
export function buildVlines(log, wrap, cols) {
  const w = Math.max(8, (cols || 80) - 2); // Box ma paddingX={1} → -2 kolumny
  const out = [];
  for (const e of log) {
    const color = inkColor(e.Color);
    const text = `${hhmmss(e.TS)} ${e.Text}`;
    if (wrap) {
      wrapAnsi(text, w, { trim: false, hard: true }).split('\n')
        .forEach((t, i) => out.push({ text: t, color, key: `${e.Id}:${i}` }));
    } else {
      out.push({ text, color, key: String(e.Id), trunc: true });
    }
  }
  return out;
}

// Panel logu na ekranie głównym. Przewijany kółkiem/strzałkami: `scroll` to ile
// wizualnych wierszy od dołu (0 = najnowsze na dole). Zawsze mieści się w
// budżecie `rows` — wskaźniki „↑/↓ więcej" zabierają wiersz z okna treści.
export default function LogPane({ vlines, rows = 10, scroll = 0 }) {
  const total = vlines.length;
  // +1, bo na górze wskaźnik „↓ nowszych" zabiera wiersz z okna — inaczej
  // najstarszych wpisów (tyle, ile zajmują wskaźniki) nie dałoby się odsłonić.
  const maxScroll = total > rows ? total - rows + 1 : 0;
  const off = Math.min(Math.max(0, scroll), maxScroll);
  const end = total - off;

  const hasBelow = end < total;                 // przewinięto w górę → są nowsze pod spodem
  let avail = Math.max(1, rows - (hasBelow ? 1 : 0));
  let start = Math.max(0, end - avail);
  const hasAbove = start > 0;                    // są starsze nad
  if (hasAbove) { avail = Math.max(1, avail - 1); start = Math.max(0, end - avail); }

  const slice = vlines.slice(start, end);

  return (
    <Box flexDirection="column" paddingX={1}>
      {hasAbove && <Text color="gray" dimColor>↑ {start} starszych</Text>}
      {slice.length === 0
        ? <Text color="gray" dimColor>— pusto —</Text>
        : slice.map((l) => (
            <Text key={l.key} color={l.color} wrap={l.trunc ? 'truncate-end' : 'wrap'}>{l.text}</Text>
          ))}
      {hasBelow && <Text color="gray" dimColor>↓ {total - end} nowszych</Text>}
    </Box>
  );
}
