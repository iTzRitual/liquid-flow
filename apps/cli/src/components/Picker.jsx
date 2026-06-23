import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { windowList } from '../window.js';

// Generyczna lista wyboru. items: [{ label, hint?, value }].
// ↑/↓ nawigacja, Enter wybór, Esc anulowanie. `maxRows` ogranicza wysokość —
// dłuższa lista przewija się za zaznaczeniem (wskaźniki ↑/↓ więcej).
export default function Picker({ title, items, onSelect, onCancel, onSlash, maxRows = 12 }) {
  const [i, setI] = useState(0);

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (onSlash && input === '/') { onSlash(); return; }
    if (!items.length) return;
    if (key.upArrow) setI((p) => (p - 1 + items.length) % items.length);
    else if (key.downArrow) setI((p) => (p + 1) % items.length);
    else if (key.return) onSelect?.(items[i], i);
  });

  const w = windowList(items.length, i, maxRows);
  const slice = items.slice(w.start, w.start + w.count);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {items.length === 0
        ? <Text color="gray" dimColor>— pusto —  (Esc aby wrócić)</Text>
        : (
          <>
            {w.above > 0 && <Text color="gray" dimColor>↑ {w.above} więcej</Text>}
            {slice.map((it, k) => {
              const idx = w.start + k;
              const sel = idx === i;
              return (
                <Text key={idx} color={sel ? 'black' : 'white'} backgroundColor={sel ? 'cyan' : undefined} wrap="truncate-end">
                  {sel ? '› ' : '  '}{it.label}
                  {it.hint ? <Text color={sel ? 'black' : 'gray'}>  {it.hint}</Text> : null}
                </Text>
              );
            })}
            {w.below > 0 && <Text color="gray" dimColor>↓ {w.below} więcej</Text>}
          </>
        )}
      <Text color="gray" dimColor>↑/↓ wybór · Enter zatwierdź · Esc wróć{onSlash ? ' · / komenda' : ''}</Text>
    </Box>
  );
}
