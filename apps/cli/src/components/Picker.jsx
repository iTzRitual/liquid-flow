import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';
import { tfmt } from '@liquidflow/core';
import { windowList } from '../window.js';

// Generyczna lista wyboru.
//   pozycja akcji:     { label, hint?, value }
//   pozycja przełącznik:{ kind:'toggle', label, on:bool, onToggle:(newVal)=>void }
// ↑/↓ nawigacja, Enter wybór (akcja). Na przełączniku ←/→ (lub Enter) zmienia
// Tak/Nie inline — bez wchodzenia w podmenu. Esc anuluje. `maxRows` ogranicza
// wysokość (przewijanie za zaznaczeniem).
// `initialIndex`/`onIndexChange` pozwalają zapamiętać pozycję kursora między
// wejściami: gdy z tej listy otwieramy kolejny ekran, a potem wracamy Esc, kursor
// wraca na ten sam wiersz (App trzyma indeks na obiekcie trybu‑rodzica).
export default function Picker({ title, items, onSelect, onCancel, onSlash, maxRows = 12, initialIndex = 0, onIndexChange, t }) {
  const [i, setI] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)));
  const [toggles, setToggles] = useState({}); // lokalne (optymistyczne) wartości przełączników
  useEffect(() => { onIndexChange?.(i); }, [i]); // raportuj pozycję rodzicowi (pamięć kursora)

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
        if (cur.options) {
          const curVal = toggleVal(i);
          const curIdx = cur.options.findIndex((o) => o.value === curVal);
          const dir = key.leftArrow ? -1 : 1;
          const nv = cur.options[(curIdx + dir + cur.options.length) % cur.options.length].value;
          setToggles((t) => ({ ...t, [i]: nv }));
          cur.onToggle?.(nv);
        } else {
          const nv = !toggleVal(i);
          setToggles((t) => ({ ...t, [i]: nv }));
          cur.onToggle?.(nv);
        }
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
      if (it.options) {
        return (
          <Text key={idx} wrap="truncate-end">
            <Text color={sel ? 'cyan' : undefined}>{sel ? '› ' : '  '}{it.label}: </Text>
            {it.options.map((opt, k) => (
              <React.Fragment key={opt.value}>
                {k > 0 && <Text> </Text>}
                <Text color={opt.value === val ? 'black' : undefined} backgroundColor={opt.value === val ? 'cyan' : undefined}> {opt.label} </Text>
              </React.Fragment>
            ))}
          </Text>
        );
      }
      return (
        <Text key={idx} wrap="truncate-end">
          <Text color={sel ? 'cyan' : undefined}>{sel ? '› ' : '  '}{it.label}: </Text>
          <Text color={val ? 'black' : 'gray'} backgroundColor={val ? 'cyan' : undefined}> {t.Yes} </Text>
          <Text> </Text>
          <Text color={!val ? 'black' : 'gray'} backgroundColor={!val ? 'cyan' : undefined}> {t.No} </Text>
        </Text>
      );
    }
    return (
      <Text key={idx} color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined} wrap="truncate-end">
        {sel ? '› ' : '  '}{it.label}
        {it.hint ? <Text color={sel ? 'black' : 'gray'}>  {it.hint}</Text> : null}
      </Text>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {items.length === 0
        ? <Text dimColor>{t.PickerEmpty}</Text>
        : (
          <>
            {w.above > 0 && <Text dimColor>{tfmt(t.MoreAbove, { count: w.above })}</Text>}
            {slice.map((it, k) => renderItem(it, w.start + k))}
            {w.below > 0 && <Text dimColor>{tfmt(t.MoreBelow, { count: w.below })}</Text>}
          </>
        )}
      <Text dimColor>
        {[t.PickerNav, hasToggle ? t.PickerToggle : null, t.PickerEnter, t.PickerEsc, onSlash ? t.PickerSlash : null].filter(Boolean).join(' · ')}
      </Text>
    </Box>
  );
}
