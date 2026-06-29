import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';
import { tfmt } from '@liquidflow/core';

// Ekran konfliktów. Każdy plik to KARTA o ADAPTACYJNEJ wysokości `cardH`:
//   cardH=3: nazwa+przyciski / meta (znaczniki czasu) / note (która strona nowsza)
//   cardH=2: nazwa+przyciski / meta            (przy niskim oknie)
//   cardH=1: sama nazwa+przyciski              (skrajnie niskie okno)
// **Wiersz nazwy+przycisków renderuje się ZAWSZE** — to on niesie akcję, więc
// nawet w bardzo niskim oknie nazwa pliku jest widoczna (degradują tylko meta/note).
// Odstęp jest MIĘDZY kartami (`sep`), a NIE po ostatniej — dzięki temu górny i
// dolny wskaźnik „↑/↓ więcej" lgną symetrycznie do treści (kiedyś końcowa pusta
// linia karty dawała dolnemu wskaźnikowi dodatkowy odstęp → asymetria).
// Na dole — stała stopka: jeden wiersz operacji seryjnych („Pobierz/Wyślij
// wszystkie”).
// Nawigacja: ↑/↓ między kartami i stopką, ←/→
// wybór akcji w wierszu, Enter wykonuje, Esc anuluje.
//   files: [{ name, meta, note, options:[{label,value}], initial }]
//   bulk:  [{ label, value }]  (opcjonalne)
//
// **Stała wysokość ekranu (NIE psuć!)**: region kart zajmuje ZAWSZE dokładnie
// `regionTarget = maxRows − footer` wierszy, niezależnie od pozycji kursora —
// inaczej ekran (przyklejony do dołu) zmienia wysokość przy każdym ↑/↓ i przesuwa
// log nad nim („skakanie"). Stałość bierze się z czterech rzeczy: (1) liczba
// widocznych kart `cap` ORAZ ich wysokość `cardH` zależą tylko od `regionTarget`,
// NIE od kursora; (2) każda widoczna karta renderuje DOKŁADNIE `cardH` wierszy
// (brakujący note → pusta linia); (3) oba wskaźniki „↑/↓ więcej" mają po 1
// wierszu (pusty slot gdy brak); (4) region jest dopełniany pustymi liniami do
// `regionTarget`. Test: `apps/cli/src/components/ConflictList.test.jsx`.
//
// Kursor ←/→ należy WYŁĄCZNIE do bieżącego wiersza i NIE jest pamiętany — przy
// wejściu na kartę (↑/↓) startuje od bezpiecznego domyślnego wyboru (`initial`).
// Liczy się dopiero Enter (działa natychmiast na bieżącej karcie), więc
// zapamiętywanie pozycji na innych kartach nic nie wnosi. Wszystkie przyciski są
// pełnokontrastowe; podświetlenie (cyan tło) ma tylko kursor bieżącego wiersza.

export default function ConflictList({ title, files, bulk, onAction, onBulk, onCancel, maxRows = 12, initialIndex = 0, onIndexChange, t }) {
  const hasBulk = Array.isArray(bulk) && bulk.length > 0;
  const rows = files.length + (hasBulk ? 1 : 0);

  const optsFor = (idx) => (idx < files.length ? files[idx].options : bulk) || [];
  const initFor = (idx) => (idx < files.length ? (files[idx].initial ?? 0) : 0);

  // `initialIndex` przywraca podświetloną kartę po powrocie Esc z podglądu/
  // potwierdzenia otwartego z tej listy (App trzyma indeks na trybie‑rodzicu).
  // Kursor ←/→ nadal NIE jest pamiętany — startuje od bezpiecznego `initFor`.
  const startRow = Math.min(Math.max(0, initialIndex), Math.max(0, rows - 1));
  const [i, setI] = useState(startRow);
  const [cursor, setCursor] = useState(() => initFor(startRow)); // pozycja ←/→ tylko bieżącego wiersza
  useEffect(() => { onIndexChange?.(i); }, [i]); // raportuj pozycję rodzicowi (pamięć karty)

  // kursor przycięty do liczby opcji bieżącego wiersza (np. po odświeżeniu listy)
  const curOpts = optsFor(i);
  const curCursor = Math.max(0, Math.min(cursor, curOpts.length - 1));

  const bulkFocused = hasBulk && i === files.length;

  // ↑/↓ — w stopce przesuwa kursor między przyciskami (tak jak ←/→); na granicy
  // listy plików ↔ stopka skok jak w ConnectList.
  const moveRow = (delta) => {
    if (bulkFocused) {
      const next = curCursor + delta;
      if (next < 0) {
        if (files.length) { setI(files.length - 1); setCursor(initFor(files.length - 1)); }
      } else if (next >= bulk.length) {
        if (files.length) { setI(0); setCursor(initFor(0)); }
      } else {
        setCursor(next);
      }
      return;
    }
    const next = i + delta;
    if (hasBulk && next >= files.length) {
      setI(files.length); setCursor(0);
    } else if (hasBulk && next < 0) {
      setI(files.length); setCursor(bulk.length - 1);
    } else {
      const n = (next + files.length) % files.length;
      setI(n); setCursor(initFor(n));
    }
  };

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

  // Renderuje DOKŁADNIE `cardH` wierszy (1–3). Wiersz nazwy+przycisków zawsze;
  // meta od cardH≥2; note (lub pusta linia gdy brak note) od cardH≥3.
  const renderCard = (f, idx, cardH) => {
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
        {cardH >= 2 && <Text dimColor wrap="truncate-end">  {f.meta}</Text>}
        {cardH >= 3 && (f.note
          ? <Text dimColor wrap="truncate-end">  {f.note}</Text>
          : <Text> </Text>)}
      </Box>
    );
  };

  // Region kart o STAŁEJ wysokości `regionTarget` (= cała wysokość minus stopka),
  // niezależnej od pozycji kursora. App budżetuje box na `maxRows + 4` (chrome =
  // ramka 2 + tytuł 1 + stopka + pomoc 1), więc region kart = `maxRows − footer`.
  const SEP = 1; // odstęp MIĘDZY kartami (nie po ostatniej → symetria wskaźników)
  const footerLines = hasBulk ? 1 : 0;
  const regionTarget = Math.max(1, maxRows - footerLines);
  const fileFocus = files.length ? Math.min(i, files.length - 1) : 0;

  // Pełny widok = wszystkie karty (cardH=3) z separatorami. Gdy się nie mieści,
  // okienkujemy i degradujemy wysokość karty do dostępnego miejsca.
  const fullAll = files.length * 3 + Math.max(0, files.length - 1) * SEP;
  const overflow = files.length > 0 && fullAll > regionTarget;

  let slice, above, below, cardH, sep, padLines, sliceStart, showIndicators;
  if (!overflow) {
    cardH = 3; sep = SEP; sliceStart = 0; above = 0; below = 0; showIndicators = false;
    slice = files;
    const content = files.length * cardH + Math.max(0, files.length - 1) * sep;
    padLines = Math.max(0, regionTarget - content);
  } else {
    // Sloty wskaźników (2 wiersze) tylko gdy region je pomieści obok ≥1 karty;
    // przy skrajnie niskim oknie rezygnujemy z nich, by nie przepełnić kadru.
    showIndicators = regionTarget >= 3;
    const reserve = showIndicators ? 2 : 0;
    // `avail` = miejsce na karty po rezerwie na sloty wskaźników.
    // `cardH`/`cap` liczone z `avail` (NIE z kursora) → stała wysokość regionu.
    const avail = Math.max(1, regionTarget - reserve);
    cardH = avail >= 3 ? 3 : avail >= 2 ? 2 : 1;
    sep = cardH >= 2 ? SEP : 0; // przy 1‑wierszowych kartach bez odstępów (ciasno)
    let cap = Math.max(1, Math.floor((avail + sep) / (cardH + sep)));
    cap = Math.min(cap, files.length);
    while (cap > 1 && cap * cardH + (cap - 1) * sep > avail) cap--; // korekta zaokrągleń
    const start = Math.max(0, Math.min(fileFocus - Math.floor(cap / 2), files.length - cap));
    above = start; below = files.length - (start + cap);
    slice = files.slice(start, start + cap); sliceStart = start;
    const content = cap * cardH + (cap - 1) * sep;
    padLines = Math.max(0, regionTarget - reserve - content);
  }

  const help = [t.PickerNav, t.PickerChoose, t.PickerEnter, t.PickerEsc].filter(Boolean).join(' · ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {files.length === 0
        ? <Text dimColor>{t.NoConflicts}</Text>
        : (
          <>
            {/* Oba wskaźniki to STAŁE 1‑wierszowe sloty (pusty gdy brak) —
                symetria wysokości niezależnie od położenia kursora. Karty nie
                mają końcowej pustej linii (odstęp jest MIĘDZY nimi), więc górny
                i dolny wskaźnik lgną do treści symetrycznie. */}
            {showIndicators && <Text dimColor>{above > 0 ? tfmt(t.MoreAbove, { count: above }) : ' '}</Text>}
            {slice.map((f, k) => (
              <React.Fragment key={sliceStart + k}>
                {k > 0 && sep > 0 && <Text> </Text>}
                {renderCard(f, sliceStart + k, cardH)}
              </React.Fragment>
            ))}
            {showIndicators && <Text dimColor>{below > 0 ? tfmt(t.MoreBelow, { count: below }) : ' '}</Text>}
            {Array.from({ length: padLines }, (_, k) => <Text key={`pad${k}`}> </Text>)}
          </>
        )}
      {hasBulk && (
        <Box>
          {renderButtons(bulk, curCursor, bulkFocused)}
        </Box>
      )}
      <Text dimColor>{help}</Text>
    </Box>
  );
}
