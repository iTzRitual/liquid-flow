import React from 'react';
import { Box, Text } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { tfmt } from '@liquidflow/core';

// Mapowanie kolorów z rdzenia (hex) na nazwy kolorów Ink.
function inkColor(hex) {
  switch ((hex || '').toUpperCase()) {
    case '#F00': return 'red';
    case '#2A2': return 'green';
    // #FFF = wpis domyślny: bez koloru = foreground terminala (czytelny na
    // ciemnym I jasnym tle; „white" znikał na białym terminalu).
    case '#FFF': return undefined;
    default: return 'gray';
  }
}

function hhmmss(ts) {
  try { return new Date(ts).toLocaleTimeString('pl-PL', { hour12: false }); }
  catch { return ''; }
}

// Buduje „wizualne wiersze" logu (jednostka przewijania).
//  - wrap=false (domyślnie): każdy wpis = 1 wiersz (obcinany przy renderze),
//  - wrap=true (/wrap): długie wpisy zawijają się na kilka wierszy — alternatywny
//    tryb, w którym czytasz całość bez otwierania osobnego ekranu.
// Liczone tą samą `wrap-ansi`+hard co Ink, więc render zgadza się co do wiersza.
export function buildVlines(log, wrap, cols) {
  const w = Math.max(8, (cols || 80) - 2); // Box ma paddingX={1} → -2 kolumny
  const out = [];
  for (const e of log) {
    // Separator (np. granica sesji) — linia działowa „── tekst ─────".
    if (e.kind === 'separator') {
      const label = `── ${e.Text} `;
      const fill = Math.max(0, w - [...label].length);
      out.push({ text: label + '─'.repeat(fill), color: '#82bbff', key: String(e.Id), trunc: true });
      continue;
    }
    const color = inkColor(e.Color);
    const dim = !!e.historic; // wpisy z poprzedniej sesji — wyszarzone
    const text = `${hhmmss(e.TS)} ${e.Text}`;
    if (wrap) {
      wrapAnsi(text, w, { trim: false, hard: true }).split('\n')
        .forEach((t, i) => out.push({ text: t, color, dim, key: `${e.Id}:${i}` }));
    } else {
      out.push({ text, color, dim, key: String(e.Id), trunc: true });
    }
  }
  return out;
}

// Panel logu na ekranie głównym. Przewijany kółkiem/strzałkami: `scroll` to ile
// wizualnych wierszy od dołu (0 = najnowsze na dole). Zawsze mieści się w
// budżecie `rows` — wskaźniki „↑/↓ więcej" zabierają wiersz z okna treści.
// `dim` wyszarza CAŁY log (gdy jest tłem dla otwartej palety/ekranu — kontekst,
// nie aktywna treść; ten sam efekt co `historic` dla poprzedniej sesji).
export default function LogPane({ vlines, rows = 10, scroll = 0, t, dim = false }) {
  const total = vlines.length;
  // +1, bo na górze wskaźnik „↓ nowszych" zabiera wiersz z okna — inaczej
  // najstarszych wpisów (tyle, ile zajmują wskaźniki) nie dałoby się odsłonić.
  const maxScroll = total > rows ? total - rows + 1 : 0;
  const off = Math.min(Math.max(0, scroll), maxScroll);
  const end = total - off;

  const hasBelow = end < total;                 // przewinięto w górę → są nowsze pod spodem
  // Budżet na wpisy = rows minus wskaźniki, które faktycznie pokażemy. NIE
  // podłogujemy `avail` do 1 — przy `rows===1` ze wskaźnikiem „↑" budżet wpisów
  // musi spaść do 0, inaczej wskaźnik + wpis = 2 wiersze przekraczają `rows`
  // (Ink przy przepełnieniu obcina/duplikuje kadr). Lepiej pokazać sam wskaźnik.
  let avail = rows - (hasBelow ? 1 : 0);
  let start = Math.max(0, end - Math.max(0, avail));
  let hasAbove = start > 0;                      // są starsze nad
  if (hasAbove) { avail -= 1; start = Math.max(0, end - Math.max(0, avail)); hasAbove = start > 0; }

  const slice = avail > 0 ? vlines.slice(start, end) : [];

  // Złóż wszystkie wiersze i utnij twardo do `rows` (zostaw dolne — najnowsze,
  // najbliżej akcji). Zabezpiecza skrajny przypadek `rows===1` z treścią i nad,
  // i pod oknem (oba wskaźniki = 2 wiersze): cap przycina do budżetu zamiast
  // przepełnić kadr (Ink przy przepełnieniu obcina/dubluje).
  const pieces = [];
  if (hasAbove) pieces.push(<Text key="above" dimColor>{tfmt(t.OlderEntries, { count: start })}</Text>);
  if (total === 0) pieces.push(<Text key="empty" dimColor>{t.LogEmpty}</Text>);
  for (const l of slice) pieces.push(
    <Text key={l.key} color={l.color} dimColor={l.dim || dim} wrap={l.trunc ? 'truncate-end' : 'wrap'}>{l.text}</Text>
  );
  if (hasBelow) pieces.push(<Text key="below" dimColor>{tfmt(t.NewerEntries, { count: total - end })}</Text>);
  const visible = pieces.length > rows ? pieces.slice(pieces.length - rows) : pieces;

  return <Box flexDirection="column" paddingX={1}>{visible}</Box>;
}
