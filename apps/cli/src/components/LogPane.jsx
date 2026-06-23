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

// Ogon logu na żywo — ostatnie `rows` wpisów, każdy obcinany do jednego wiersza
// (`truncate-end`), żeby panel miał stałą wysokość i Ink nie doklejał kopii.
// Pełne, zawijane linie czyta się w przewijanym widoku `/log` (`LogView`).
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
