import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

// Generyczna lista wyboru. items: [{ label, hint?, value }].
// ↑/↓ nawigacja, Enter wybór, Esc anulowanie.
export default function Picker({ title, items, onSelect, onCancel }) {
  const [i, setI] = useState(0);

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (!items.length) return;
    if (key.upArrow) setI((p) => (p - 1 + items.length) % items.length);
    else if (key.downArrow) setI((p) => (p + 1) % items.length);
    else if (key.return) onSelect?.(items[i], i);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {items.length === 0
        ? <Text color="gray" dimColor>— pusto —  (Esc aby wrócić)</Text>
        : items.map((it, idx) => (
            <Text key={idx} color={idx === i ? 'black' : 'white'} backgroundColor={idx === i ? 'cyan' : undefined}>
              {idx === i ? '› ' : '  '}{it.label}
              {it.hint ? <Text color={idx === i ? 'black' : 'gray'}>  {it.hint}</Text> : null}
            </Text>
          ))}
      <Text color="gray" dimColor>↑/↓ wybór · Enter zatwierdź · Esc wróć</Text>
    </Box>
  );
}
