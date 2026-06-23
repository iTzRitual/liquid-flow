import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import wrapAnsi from 'wrap-ansi';

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

// Pełnoekranowy, przewijalny podgląd całego logu. W przeciwieństwie do ogona
// (`LogPane`) tutaj linie ZAWIJAJĄ się — czytasz wszystko w całości.
// Spłaszczamy wpisy do listy „wizualnych wierszy" (po zawinięciu tą samą
// `wrap-ansi`+hard co Ink), żeby przewijać precyzyjnie po jednym wierszu.
// `start === null` oznacza „trzymaj się dołu" (najnowsze).
export default function LogView({ log, rows = 20, cols = 80, onCancel }) {
  const w = Math.max(8, cols - 4);              // ramka(2) + paddingX(2)
  const innerRows = Math.max(3, rows - 4);      // ramka(2) + tytuł(1) + stopka(1)

  const vlines = [];
  for (const e of log) {
    const color = inkColor(e.Color);
    const parts = wrapAnsi(`${hhmmss(e.TS)} ${e.Text}`, w, { trim: false, hard: true }).split('\n');
    parts.forEach((text, idx) => vlines.push({ text, color, first: idx === 0, key: `${e.Id}:${idx}` }));
  }

  const maxStart = Math.max(0, vlines.length - innerRows);
  const [start, setStart] = useState(null); // null => follow tail
  const effStart = start === null ? maxStart : Math.min(Math.max(0, start), maxStart);

  useInput((input, key) => {
    if (key.escape || input === 'q') { onCancel?.(); return; }
    if (key.upArrow) { setStart(Math.max(0, effStart - 1)); return; }
    if (key.downArrow) { const ns = effStart + 1; setStart(ns >= maxStart ? null : ns); return; }
    if (key.pageUp) { setStart(Math.max(0, effStart - innerRows)); return; }
    if (key.pageDown) { const ns = effStart + innerRows; setStart(ns >= maxStart ? null : ns); return; }
    if (input === 'g') { setStart(0); return; }
    if (input === 'G') { setStart(null); return; }
  });

  const slice = vlines.slice(effStart, effStart + innerRows);
  const above = effStart;
  const below = Math.max(0, vlines.length - (effStart + innerRows));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold wrap="truncate-end">
        Log{vlines.length ? ` (${log.length} wpisów)` : ''}
        {above > 0 ? <Text color="gray" dimColor>  ↑ {above}</Text> : null}
        {below > 0 ? <Text color="gray" dimColor>  ↓ {below}</Text> : null}
      </Text>
      {vlines.length === 0
        ? <Text color="gray" dimColor>— pusto —</Text>
        : slice.map((l) => <Text key={l.key} color={l.color} wrap="truncate-end">{l.text}</Text>)}
      <Text color="gray" dimColor wrap="truncate-end">↑/↓ przewiń · PgUp/PgDn · g/G góra/dół · Esc wróć</Text>
    </Box>
  );
}
