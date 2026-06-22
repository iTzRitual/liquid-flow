import React from 'react';
import { Box, Text } from 'ink';

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

// Panel logu na żywo — pokazuje ostatnie `rows` wpisów. Każdy wpis jest
// obcinany do szerokości terminala (wrap="truncate"), aby zajmował dokładnie
// jeden wiersz — inaczej długie linie (np. ścieżki) zawijają się, ramka
// przerasta ekran i Ink dokleja jej kopię.
export default function LogPane({ log, rows = 10 }) {
  const visible = log.slice(-rows);
  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.length === 0
        ? <Text color="gray" dimColor>— pusto —</Text>
        : visible.map((e) => (
            <Text key={e.Id} color={inkColor(e.Color)} wrap="truncate-end">
              <Text color="gray">{hhmmss(e.TS)} </Text>{e.Text}
            </Text>
          ))}
    </Box>
  );
}
