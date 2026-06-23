import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { windowList } from '../window.js';

// Generyczna lista wyboru.
//   pozycja akcji:     { label, hint?, value }
//   pozycja przełącznik:{ kind:'toggle', label, on:bool, onToggle:(newVal)=>void }
// ↑/↓ nawigacja, Enter wybór (akcja). Na przełączniku ←/→ (lub Enter) zmienia
// Tak/Nie inline — bez wchodzenia w podmenu. Esc anuluje. `maxRows` ogranicza
// wysokość (przewijanie za zaznaczeniem).
export default function Picker({ title, items, onSelect, onCancel, onSlash, maxRows = 12 }) {
  const [i, setI] = useState(0);
  const [toggles, setToggles] = useState({}); // lokalne (optymistyczne) wartości przełączników

  const toggleVal = (idx) => (idx in toggles ? toggles[idx] : items[idx].on);
  const hasToggle = items.some((it) => it && it.kind === 'toggle');

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (onSlash && input === '/') { onSlash(); return; }
    if (!items.length) return;
    if (key.upArrow) { setI((p) => (p - 1 + items.length) % items.length); return; }
    if (key.downArrow) { setI((p) => (p + 1) % items.length); return; }

    const cur = items[i];
    if (cur && cur.kind === 'toggle') {
      if (key.leftArrow || key.rightArrow || key.return) {
        const nv = !toggleVal(i);
        setToggles((t) => ({ ...t, [i]: nv }));
        cur.onToggle?.(nv);
      }
      return;
    }
    if (key.return) onSelect?.(cur, i);
  });

  const w = windowList(items.length, i, maxRows);
  const slice = items.slice(w.start, w.start + w.count);

  const renderItem = (it, idx) => {
    const sel = idx === i;
    if (it.kind === 'toggle') {
      const val = toggleVal(idx);
      return (
        <Text key={idx} wrap="truncate-end">
          <Text color={sel ? 'cyan' : 'gray'}>{sel ? '› ' : '  '}{it.label}: </Text>
          <Text color={val ? 'black' : 'gray'} backgroundColor={val ? 'cyan' : undefined}> Tak </Text>
          <Text> </Text>
          <Text color={!val ? 'black' : 'gray'} backgroundColor={!val ? 'cyan' : undefined}> Nie </Text>
        </Text>
      );
    }
    return (
      <Text key={idx} color={sel ? 'black' : 'white'} backgroundColor={sel ? 'cyan' : undefined} wrap="truncate-end">
        {sel ? '› ' : '  '}{it.label}
        {it.hint ? <Text color={sel ? 'black' : 'gray'}>  {it.hint}</Text> : null}
      </Text>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {items.length === 0
        ? <Text color="gray" dimColor>— pusto —  (Esc aby wrócić)</Text>
        : (
          <>
            {w.above > 0 && <Text color="gray" dimColor>↑ {w.above} więcej</Text>}
            {slice.map((it, k) => renderItem(it, w.start + k))}
            {w.below > 0 && <Text color="gray" dimColor>↓ {w.below} więcej</Text>}
          </>
        )}
      <Text color="gray" dimColor>↑/↓ wybór{hasToggle ? ' · ←/→ przełącz' : ''} · Enter zatwierdź · Esc wróć{onSlash ? ' · / komenda' : ''}</Text>
    </Box>
  );
}
