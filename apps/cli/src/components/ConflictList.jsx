import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { tfmt } from '@liquidflow/core';
import { windowCards } from '../window.js';

// Ekran konfliktów. Każdy plik to KARTA (3 wiersze):
//   1) nazwa (do lewej, przycinana) + przyciski akcji (do prawej, nie kurczą się)
//   2) metadane (znaczniki czasu / która strona nowsza)
//   3) pusta linia (odstęp)
// Na dole — stała stopka: pusta linia + jeden wiersz operacji seryjnych
// („Pobierz/Wyślij wszystkie”). Nawigacja: ↑/↓ między kartami i stopką, ←/→
// wybór akcji w wierszu, Enter wykonuje, Esc anuluje.
//   files: [{ name, meta, options:[{label,value}], initial }]
//   bulk:  [{ label, value }]  (opcjonalne)
const CARD_LINES = 3;

export default function ConflictList({ title, files, bulk, onAction, onBulk, onCancel, maxRows = 12, t }) {
  const hasBulk = Array.isArray(bulk) && bulk.length > 0;
  const rows = files.length + (hasBulk ? 1 : 0);
  const [i, setI] = useState(0);
  const [sel, setSel] = useState({}); // rowIndex → wybrany indeks opcji

  const optsFor = (idx) => (idx < files.length ? files[idx].options : bulk);
  const initFor = (idx) => (idx < files.length ? (files[idx].initial ?? 0) : 0);
  const selVal = (idx) => (idx in sel ? sel[idx] : initFor(idx));

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (!rows) return;
    if (key.upArrow) { setI((p) => (p - 1 + rows) % rows); return; }
    if (key.downArrow) { setI((p) => (p + 1) % rows); return; }
    const opts = optsFor(i);
    const n = opts.length;
    if (key.leftArrow) { setSel((s) => ({ ...s, [i]: (selVal(i) - 1 + n) % n })); return; }
    if (key.rightArrow) { setSel((s) => ({ ...s, [i]: (selVal(i) + 1) % n })); return; }
    if (key.return) {
      const o = opts[selVal(i)];
      if (i < files.length) onAction?.(o.value, files[i]);
      else onBulk?.(o.value);
    }
  });

  // przyciski akcji jednej karty/stopki (selektor ←/→)
  const renderButtons = (options, cv, focused) =>
    options.map((o, oi) => (
      <Text
        key={oi}
        color={oi === cv ? (focused ? 'black' : undefined) : 'gray'}
        backgroundColor={focused && oi === cv ? 'cyan' : undefined}
      > {o.label} </Text>
    ));

  const renderCard = (f, idx) => {
    const focused = idx === i;
    const cv = selVal(idx);
    return (
      <Box key={idx} flexDirection="column">
        <Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text color={focused ? 'cyan' : undefined} wrap="truncate-end">
              {focused ? '› ' : '  '}{f.name}
            </Text>
          </Box>
          <Box flexShrink={0} marginLeft={2}>{renderButtons(f.options, cv, focused)}</Box>
        </Box>
        <Text dimColor wrap="truncate-end">  {f.meta}</Text>
        <Text> </Text>
      </Box>
    );
  };

  // budżet kart: cała wysokość minus stopka (pusta linia + wiersz przycisków)
  const footerLines = hasBulk ? 2 : 0;
  const budget = Math.max(CARD_LINES, maxRows - footerLines);
  const fileFocus = files.length ? Math.min(i, files.length - 1) : 0;
  const w = windowCards(files.length, fileFocus, budget, CARD_LINES);
  const slice = files.slice(w.start, w.start + w.count);

  const bulkFocused = hasBulk && i === files.length;
  const help = [t.PickerNav, t.PickerChoose, t.PickerEnter, t.PickerEsc].filter(Boolean).join(' · ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {files.length === 0
        ? <Text dimColor>{t.NoConflicts}</Text>
        : (
          <>
            {w.above > 0 && <Text dimColor>{tfmt(t.MoreAbove, { count: w.above })}</Text>}
            {slice.map((f, k) => renderCard(f, w.start + k))}
            {w.below > 0 && <Text dimColor>{tfmt(t.MoreBelow, { count: w.below })}</Text>}
          </>
        )}
      {hasBulk && (
        <>
          <Text> </Text>
          <Box>
            <Text color={bulkFocused ? 'cyan' : 'gray'}>{bulkFocused ? '› ' : '  '}</Text>
            {renderButtons(bulk, selVal(files.length), bulkFocused)}
          </Box>
        </>
      )}
      <Text dimColor>{help}</Text>
    </Box>
  );
}
