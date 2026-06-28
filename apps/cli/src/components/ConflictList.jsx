import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { tfmt } from '@liquidflow/core';

// Ekran konfliktów. Każdy plik to KARTA (4 wiersze):
//   1) nazwa (do lewej, przycinana) + przyciski akcji (do prawej, nie kurczą się)
//   2) znaczniki czasu (lokalny / zdalny)
//   3) która strona nowsza (słowny opis)
//   4) pusta linia (odstęp)
// Na dole — stała stopka: jeden wiersz operacji seryjnych („Pobierz/Wyślij
// wszystkie”); odstęp nad nią daje końcowa pusta linia ostatniej karty (lub
// wskaźnik „↓ więcej"), więc stopka nie dokłada własnej pustej linii.
// Nawigacja: ↑/↓ między kartami i stopką, ←/→
// wybór akcji w wierszu, Enter wykonuje, Esc anuluje.
//   files: [{ name, meta, note, options:[{label,value}], initial }]
//   bulk:  [{ label, value }]  (opcjonalne)
//
// **Stała wysokość ekranu (NIE psuć!)**: region kart zajmuje ZAWSZE dokładnie
// `regionTarget = maxRows − footer` wierszy, niezależnie od pozycji kursora —
// inaczej ekran (przyklejony do dołu) zmienia wysokość przy każdym ↑/↓ i przesuwa
// log nad nim („skakanie"). Stałość bierze się z trzech rzeczy: (1) liczba
// widocznych kart `cap` zależy tylko od `regionTarget`, NIE od kursora (własne
// okienkowanie zamiast `windowCards`, które przy 4‑wierszowych kartach zwracało
// zmienny `count`); (2) oba wskaźniki „↑/↓ więcej" mają po 1 wierszu (pusty slot
// gdy brak) — bez asymetrii „↑" = 2 wiersze; (3) region jest dopełniany pustymi
// liniami do `regionTarget`. Test: `apps/cli/src/components/ConflictList.test.jsx`.
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

  // Region kart o STAŁEJ wysokości `regionTarget` (= cała wysokość minus stopka),
  // niezależnej od pozycji kursora. App budżetuje box na `maxRows + 4` (chrome =
  // ramka 2 + tytuł 1 + stopka + pomoc 1), więc region kart = `maxRows − footer`.
  const footerLines = hasBulk ? 1 : 0;
  const regionTarget = Math.max(CARD_LINES, maxRows - footerLines);
  const fileFocus = files.length ? Math.min(i, files.length - 1) : 0;

  // Okienkowanie z kursoro‑NIEZALEŻNYM `cap` (rezerwa 2 wierszy na sloty
  // wskaźników) → liczba widocznych kart stała, niezależnie od `fileFocus`.
  const windowed = files.length * CARD_LINES > regionTarget;
  let slice, above, below;
  if (!windowed) {
    slice = files;
    above = 0;
    below = 0;
  } else {
    const cap = Math.max(1, Math.floor((regionTarget - 2) / CARD_LINES));
    const start = Math.max(0, Math.min(fileFocus - Math.floor(cap / 2), files.length - cap));
    above = start;
    below = files.length - (start + cap);
    slice = files.slice(start, start + cap);
  }

  // Dopełnienie do `regionTarget`: stałe 2 wiersze na sloty wskaźników (przy
  // okienkowaniu) + faktyczne wiersze kart + puste linie. Daje niezmienną
  // wysokość także gdy karta bywa 3‑wierszowa (brak `note`).
  const renderedCardLines = slice.reduce((s, f) => s + (f.note ? CARD_LINES : CARD_LINES - 1), 0);
  const padLines = Math.max(0, regionTarget - (windowed ? 2 : 0) - renderedCardLines);
  const sliceStart = windowed ? above : 0;

  const bulkFocused = hasBulk && i === files.length;
  const help = [t.PickerNav, t.PickerChoose, t.PickerEnter, t.PickerEsc].filter(Boolean).join(' · ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {files.length === 0
        ? <Text dimColor>{t.NoConflicts}</Text>
        : (
          <>
            {/* Oba wskaźniki to STAŁE 1‑wierszowe sloty (pusty gdy brak) —
                symetria wysokości niezależnie od położenia kursora. */}
            {windowed && <Text dimColor>{above > 0 ? tfmt(t.MoreAbove, { count: above }) : ' '}</Text>}
            {slice.map((f, k) => renderCard(f, sliceStart + k))}
            {windowed && <Text dimColor>{below > 0 ? tfmt(t.MoreBelow, { count: below }) : ' '}</Text>}
            {Array.from({ length: padLines }, (_, k) => <Text key={`pad${k}`}> </Text>)}
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
