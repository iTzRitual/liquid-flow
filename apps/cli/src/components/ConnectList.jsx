import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';
import { tfmt } from '@liquidflow/core';
import { windowList } from '../window.js';

// Ekran łączenia ze sklepem. Dwie strefy w JEDNEJ sekwencji nawigacji:
//   1) lista zapisanych sklepów (po jednym wierszu, ↑/↓),
//   2) stopka: pusta linia + JEDEN wiersz przycisków akcji (Rozłącz / Dodaj /
//      Usuń), wybieranych ←/→ — ale ↑/↓ też po nich chodzi, w tej samej
//      kolejności (ostatni sklep ↓ → pierwszy przycisk; pierwszy przycisk ↑ →
//      ostatni sklep). Enter: na sklepie łączy, na przycisku wykonuje akcję.
//   shops:   [{ label, hint?, shop }]
//   actions: [{ key, label }]   (stopka; min. „dodaj")
const FOOTER_LINES = 2; // pusta linia + wiersz przycisków

export default function ConnectList({ title, shops, actions, onShop, onAction, onCancel, onSlash, maxRows = 12, initialIndex = 0, onIndexChange, t }) {
  const nShops = shops.length;
  const nAct = actions.length;
  const total = nShops + nAct;
  // 0..nShops-1 = sklepy, dalej = akcje. `initialIndex` przywraca pozycję po
  // powrocie Esc z ekranu otwartego z tej listy (pamięć kursora w App).
  const [i, setI] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, total - 1)));
  useEffect(() => { onIndexChange?.(i); }, [i]); // raportuj pozycję rodzicowi

  const inFooter = i >= nShops;
  const actIdx = i - nShops; // tylko gdy inFooter

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (onSlash && input === '/') { onSlash(); return; }
    if (!total) return;
    if (key.upArrow) { setI((p) => (p - 1 + total) % total); return; }
    if (key.downArrow) { setI((p) => (p + 1) % total); return; }
    // ←/→ poruszają się tylko w obrębie stopki (cyklicznie po przyciskach)
    if (inFooter && nAct) {
      if (key.leftArrow) { setI(nShops + ((actIdx - 1 + nAct) % nAct)); return; }
      if (key.rightArrow) { setI(nShops + ((actIdx + 1) % nAct)); return; }
    }
    if (key.return) {
      if (inFooter) onAction?.(actions[actIdx].key);
      else onShop?.(shops[i].shop);
    }
  });

  // okienkowanie listy sklepów (budżet = cała wysokość minus stopka)
  const budget = Math.max(1, maxRows - FOOTER_LINES);
  const focus = nShops ? Math.min(i, nShops - 1) : 0;
  const w = windowList(nShops, focus, budget);
  const slice = shops.slice(w.start, w.start + w.count);

  const help = [t.PickerNav, t.PickerChoose, t.PickerEnter, t.PickerEsc, onSlash ? t.PickerSlash : null]
    .filter(Boolean).join(' · ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {nShops > 0 && (
        <>
          {w.above > 0 && <Text dimColor>{tfmt(t.MoreAbove, { count: w.above })}</Text>}
          {slice.map((s, k) => {
            const idx = w.start + k;
            const sel = idx === i;
            return (
              <Text key={idx} color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined} wrap="truncate-end">
                {sel ? '› ' : '  '}{s.label}
                {s.hint ? <Text color={sel ? 'black' : 'gray'}>  {s.hint}</Text> : null}
              </Text>
            );
          })}
          {w.below > 0 && <Text dimColor>{tfmt(t.MoreBelow, { count: w.below })}</Text>}
        </>
      )}
      <Text> </Text>
      <Box>
        {actions.map((a, ai) => {
          const sel = inFooter && ai === actIdx;
          return (
            <Text key={a.key} color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined}> {a.label} </Text>
          );
        })}
      </Box>
      <Text dimColor>{help}</Text>
    </Box>
  );
}
