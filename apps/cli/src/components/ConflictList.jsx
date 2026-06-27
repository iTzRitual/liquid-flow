import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { tfmt } from '@liquidflow/core';
import { windowCards } from '../window.js';

// Ekran konfliktów. Każdy plik to KARTA (4 wiersze):
//   1) nazwa (do lewej, przycinana) + przyciski akcji (do prawej, nie kurczą się)
//   2) znaczniki czasu (lokalny / zdalny)
//   3) która strona nowsza (słowny opis)
//   4) pusta linia (odstęp)
// Na dole — stała stopka: jeden wiersz operacji seryjnych („Pobierz/Wyślij
// wszystkie”); odstęp nad nią daje końcowa pusta linia ostatniej karty (lub
// wskaźnik „↓ więcej"), więc stopka nie dokłada własnej pustej linii. Wskaźnik
// „↑ więcej" dostaje pustą linię POD sobą (symetria z odstępem nad „↓ więcej").
// Nawigacja: ↑/↓ między kartami i stopką, ←/→
// wybór akcji w wierszu, Enter wykonuje, Esc anuluje.
//   files: [{ name, meta, note, options:[{label,value}], initial }]
//   bulk:  [{ label, value }]  (opcjonalne)
//
// Kursor ←/→ należy WYŁĄCZNIE do bieżącego wiersza i NIE jest pamiętany — przy
// wejściu na kartę (↑/↓) startuje od bezpiecznego domyślnego wyboru (`initial`).
// Liczy się dopiero Enter (działa natychmiast na bieżącej karcie), więc
// zapamiętywanie pozycji na innych kartach nic nie wnosi. Wszystkie przyciski są
// pełnokontrastowe; podświetlenie (cyan tło) ma tylko kursor bieżącego wiersza.
const CARD_LINES = 4;

export default function ConflictList({ title, files, bulk, onAction, onBulk, onCancel, maxRows = 12, t }) {
  const hasBulk = Array.isArray(bulk) && bulk.length > 0;
  const rows = files.length + (hasBulk ? 1 : 0);

  const optsFor = (idx) => (idx < files.length ? files[idx].options : bulk) || [];
  const initFor = (idx) => (idx < files.length ? (files[idx].initial ?? 0) : 0);

  const [i, setI] = useState(0);
  const [cursor, setCursor] = useState(() => initFor(0)); // pozycja ←/→ tylko bieżącego wiersza

  // ↑/↓ — zmiana wiersza resetuje kursor do bezpiecznego domyślnego wyboru.
  const moveRow = (delta) => {
    const n = (i + delta + rows) % rows;
    setI(n);
    setCursor(initFor(n));
  };

  // kursor przycięty do liczby opcji bieżącego wiersza (np. po odświeżeniu listy)
  const curOpts = optsFor(i);
  const curCursor = Math.max(0, Math.min(cursor, curOpts.length - 1));

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (!rows) return;
    if (key.upArrow) { moveRow(-1); return; }
    if (key.downArrow) { moveRow(1); return; }
    const n = curOpts.length || 1;
    if (key.leftArrow) { setCursor((c) => (Math.min(c, n - 1) - 1 + n) % n); return; }
    if (key.rightArrow) { setCursor((c) => (Math.min(c, n - 1) + 1) % n); return; }
    if (key.return) {
      const o = curOpts[curCursor];
      if (!o) return;
      if (i < files.length) onAction?.(o.value, files[i]);
      else onBulk?.(o.value);
    }
  });

  // Przyciski akcji jednej karty/stopki. Wszystkie pełnokontrastowe; kursor
  // (tylko gdy wiersz `focused`) wyróżniony tłem cyan. `cv` = indeks kursora.
  const renderButtons = (options, cv, focused) =>
    options.map((o, oi) => {
      const active = focused && oi === cv;
      return (
        <Text key={oi} color={active ? 'black' : undefined} backgroundColor={active ? 'cyan' : undefined}>
          {' '}{o.label}{' '}
        </Text>
      );
    });

  const renderCard = (f, idx) => {
    const focused = idx === i;
    return (
      <Box key={idx} flexDirection="column">
        <Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text color={focused ? 'cyan' : undefined} wrap="truncate-end">
              {focused ? '› ' : '  '}{f.name}
            </Text>
          </Box>
          <Box flexShrink={0} marginLeft={2}>{renderButtons(f.options, curCursor, focused)}</Box>
        </Box>
        <Text dimColor wrap="truncate-end">  {f.meta}</Text>
        {f.note ? <Text dimColor wrap="truncate-end">  {f.note}</Text> : null}
        <Text> </Text>
      </Box>
    );
  };

  // budżet kart: cała wysokość minus stopka (sam wiersz przycisków — bez wiodącej
  // pustej linii; odstęp nad stopką daje końcowa pusta linia ostatniej karty) i
  // minus rezerwa na pustą linię pod wskaźnikiem „↑ więcej" (renderowaną tylko gdy
  // jest `above`, ale rezerwowaną zawsze, by przy przewinięciu nic nie wystawało).
  const footerLines = hasBulk ? 1 : 0;
  const aboveReserve = 1;
  const budget = Math.max(CARD_LINES, maxRows - footerLines - aboveReserve);
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
            {w.above > 0 && (
              <>
                <Text dimColor>{tfmt(t.MoreAbove, { count: w.above })}</Text>
                <Text> </Text>
              </>
            )}
            {slice.map((f, k) => renderCard(f, w.start + k))}
            {w.below > 0 && <Text dimColor>{tfmt(t.MoreBelow, { count: w.below })}</Text>}
          </>
        )}
      {hasBulk && (
        <Box>
          <Text color={bulkFocused ? 'cyan' : undefined}>{bulkFocused ? '› ' : '  '}</Text>
          {renderButtons(bulk, curCursor, bulkFocused)}
        </Box>
      )}
      <Text dimColor>{help}</Text>
    </Box>
  );
}
