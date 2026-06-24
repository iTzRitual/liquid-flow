import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { tfmt } from '@liquidflow/core';
import { windowList } from '../window.js';

// Generyczna lista wyboru.
//   pozycja akcji:     { label, hint?, value }
//   pozycja przełącznik:{ kind:'toggle', label, on:bool, onToggle:(newVal)=>void }
//   pozycja wyboru:    { kind:'choice', label, hint?, options:[{label,value}],
//                        initial?:idx, onSelect:(value, option)=>void }
// ↑/↓ nawigacja, Enter wybór (akcja). Na przełączniku ←/→ (lub Enter) zmienia
// Tak/Nie inline. Na pozycji wyboru ←/→ cyklują akcję w wierszu (bez podmenu),
// Enter wykonuje aktualnie wybraną. Esc anuluje. `maxRows` ogranicza wysokość.
export default function Picker({ title, items, onSelect, onCancel, onSlash, maxRows = 12, t }) {
  const [i, setI] = useState(0);
  const [toggles, setToggles] = useState({}); // lokalne (optymistyczne) wartości przełączników
  const [choices, setChoices] = useState({}); // idx → wybrany indeks opcji (pozycja 'choice')

  const toggleVal = (idx) => (idx in toggles ? toggles[idx] : items[idx].on);
  const choiceVal = (idx) => (idx in choices ? choices[idx] : (items[idx].initial ?? 0));
  const hasToggle = items.some((it) => it && it.kind === 'toggle');
  const hasChoice = items.some((it) => it && it.kind === 'choice');

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
    if (cur && cur.kind === 'choice') {
      const n = cur.options.length;
      if (key.leftArrow) { setChoices((c) => ({ ...c, [i]: (choiceVal(i) - 1 + n) % n })); return; }
      if (key.rightArrow) { setChoices((c) => ({ ...c, [i]: (choiceVal(i) + 1) % n })); return; }
      if (key.return) { const sel = choiceVal(i); cur.onSelect?.(cur.options[sel].value, cur.options[sel]); }
      return;
    }
    if (key.return) onSelect?.(cur, i);
  });

  const w = windowList(items.length, i, maxRows);
  const slice = items.slice(w.start, w.start + w.count);

  const renderItem = (it, idx) => {
    const sel = idx === i;
    if (it.kind === 'choice') {
      const cv = choiceVal(idx);
      return (
        <Text key={idx} wrap="truncate-end">
          <Text color={sel ? 'cyan' : 'white'}>{sel ? '› ' : '  '}{it.label}  </Text>
          {it.options.map((o, oi) => (
            <Text
              key={oi}
              color={oi === cv ? (sel ? 'black' : 'white') : 'gray'}
              backgroundColor={sel && oi === cv ? 'cyan' : undefined}
            > {o.label} </Text>
          ))}
          {it.hint ? <Text color="gray">  {it.hint}</Text> : null}
        </Text>
      );
    }
    if (it.kind === 'toggle') {
      const val = toggleVal(idx);
      return (
        <Text key={idx} wrap="truncate-end">
          <Text color={sel ? 'cyan' : 'gray'}>{sel ? '› ' : '  '}{it.label}: </Text>
          <Text color={val ? 'black' : 'gray'} backgroundColor={val ? 'cyan' : undefined}> {t.Yes} </Text>
          <Text> </Text>
          <Text color={!val ? 'black' : 'gray'} backgroundColor={!val ? 'cyan' : undefined}> {t.No} </Text>
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
        ? <Text color="gray" dimColor>{t.PickerEmpty}</Text>
        : (
          <>
            {w.above > 0 && <Text color="gray" dimColor>{tfmt(t.MoreAbove, { count: w.above })}</Text>}
            {slice.map((it, k) => renderItem(it, w.start + k))}
            {w.below > 0 && <Text color="gray" dimColor>{tfmt(t.MoreBelow, { count: w.below })}</Text>}
          </>
        )}
      <Text color="gray" dimColor>
        {[t.PickerNav, hasToggle ? t.PickerToggle : null, hasChoice ? t.PickerChoose : null, t.PickerEnter, t.PickerEsc, onSlash ? t.PickerSlash : null].filter(Boolean).join(' · ')}
      </Text>
    </Box>
  );
}
