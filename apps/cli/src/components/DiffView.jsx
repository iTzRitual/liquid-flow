import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';
import { tfmt, buildDiffRows } from '@liquidflow/core';

// Przewijany podgląd różnic (line diff) przed rozwiązaniem konfliktu.
// Zajmuje dokładnie `maxRows + 4` wierszy (chrome: ramka 2 + tytuł 1 + stopka 1).
// Nawigacja: ↑/↓ przewijanie linii, PgUp/PgDn szybki przewijanie, Esc wróć.
//
// Trzy zabiegi czytelności (ważne — bez nich szablony z głębokim zagnieżdżeniem
// rozpadają się na ekranie):
//  1. **Sanityzacja** każdej linii (`sanitize`): taby → 2 spacje + usunięcie
//     znaków sterujących (\r, ANSI itp. — patrz niżej).
//  2. **Wspólne wcięcie (dedent)** — odcinamy minimalne wcięcie widocznych linii
//     treści, więc głęboko zagnieżdżony kod przesuwa się do lewej i widać tag,
//     a nie same spacje (z `truncate-end`, który zostawia LEWĄ stronę linii).
//  3. **Zwijanie kontekstu** (`buildDiffRows`) — pokazujemy tylko ±N linii wokół
//     zmian, resztę jako „N niezmienionych" — zmiany nie giną w morzu kontekstu.
const TAB = '  '; // tab → 2 spacje (zwięźle przy głębokim zagnieżdżeniu)
// Sanityzacja wiersza do bezpiecznego renderu w terminalu:
//  - taby → 2 spacje (Ink mierzy \t jako 1 kol., terminal rysuje do 8 → schodki),
//  - znaki sterujące USUWAMY (po rozwinięciu tabów nie ma już 0x09): \r przesuwa
//    kursor na początek wiersza i rozbija kadr (główny bug przy plikach CRLF),
//    a sekwencje ANSI (0x1b) z treści mogłyby wstrzyknąć kolory/ruch kursora.
//    Zostaje tylko tekst drukowalny.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]/g;
const sanitize = (s) => (s || '').replace(/\t/g, TAB).replace(CONTROL, '');
const leadSpaces = (s) => { const m = /^ */.exec(s); return m ? m[0].length : 0; };

export default function DiffView({ title, preview, onCancel, maxRows = 8, t }) {
  const [scroll, setScroll] = useState(0); // wiersze od góry (0 = początek)

  const isText = preview?.kind === 'text';

  // Wiersze do renderu: numery linii + zwinięty kontekst, po sanityzacji i
  // dedencie. Liczone raz na preview (memo) — stabilne przy przewijaniu.
  const { rows, gutterW } = useMemo(() => {
    if (!isText) return { rows: [], gutterW: 1 };
    const built = buildDiffRows(preview.diff, { context: 3 });
    const clean = built.map((r) => (r.type === 'fold' ? r : { ...r, text: sanitize(r.line) }));
    // wspólne wcięcie liczone tylko z niepustych linii treści (puste/fold pomijamy)
    const content = clean.filter((r) => r.type !== 'fold' && r.text.trim().length > 0);
    const minIndent = content.length ? Math.min(...content.map((r) => leadSpaces(r.text))) : 0;
    const dedented = clean.map((r) => (r.type === 'fold' ? r : { ...r, text: r.text.slice(minIndent) }));
    // szerokość rynny numerów = liczba cyfr największego numeru linii
    const totalA = preview.diff.filter((d) => d.type !== 'add').length; // lokalne (ctx+del)
    const totalB = preview.diff.filter((d) => d.type !== 'del').length; // zdalne (ctx+add)
    return { rows: dedented, gutterW: String(Math.max(1, totalA, totalB)).length };
  }, [isText, preview]);

  const added = isText ? preview.diff.filter((l) => l.type === 'add').length : 0;
  const removed = isText ? preview.diff.filter((l) => l.type === 'del').length : 0;

  // +1, by przy scroll=maxScroll górny wskaźnik „↑" zmieścił się obok ostatnich
  // wierszy (analogia do LogPane maxScroll = total - rows + 1).
  const maxScroll = Math.max(0, rows.length - maxRows + 1);
  const scrollClamped = Math.min(scroll, maxScroll);

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (key.upArrow) { setScroll((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setScroll((s) => Math.min(maxScroll, s + 1)); return; }
    if (key.pageUp) { setScroll((s) => Math.max(0, s - Math.max(1, maxRows))); return; }
    if (key.pageDown) { setScroll((s) => Math.min(maxScroll, s + Math.max(1, maxRows))); return; }
  });

  const navHint = t.PickerEsc;

  if (preview?.kind === 'binary') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>{title}</Text>
        <Text dimColor>{t.DiffBinary}</Text>
        <Text dimColor>{navHint}</Text>
      </Box>
    );
  }

  if (preview?.kind === 'tooLarge') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>{title}</Text>
        <Text dimColor>{t.DiffTooLarge}</Text>
        <Text dimColor>{navHint}</Text>
      </Box>
    );
  }

  // Okno widocznych wierszy z symetrycznymi wskaźnikami ↑/↓ (zabierają wiersz).
  const hasAbove = scrollClamped > 0;
  const avail0 = maxRows - (hasAbove ? 1 : 0);
  const hasBelow = scrollClamped + avail0 < rows.length;
  const avail = hasBelow ? avail0 - 1 : avail0;
  const visible = rows.slice(scrollClamped, scrollClamped + Math.max(0, avail));
  const belowCount = rows.length - scrollClamped - Math.max(0, avail);

  const colorFor = (type) => (type === 'add' ? 'green' : type === 'del' ? 'red' : undefined);
  const prefixFor = (type) => (type === 'add' ? '+' : type === 'del' ? '-' : ' ');
  const blankGutter = ' '.repeat(gutterW);

  // Renderuje jeden wiersz diff. Numer linii (rynna) wyszarzony; treść w kolorze
  // typu. Cały <Text> ma `truncate-end` — po sanityzacji Ink mierzy szerokość
  // poprawnie, więc tnie dokładnie na granicy kadru (bez zawijania/schodków).
  const renderRow = (r, k) => {
    if (r.type === 'fold') {
      return (
        <Text key={k} dimColor wrap="truncate-end">
          {blankGutter}  {tfmt(t.DiffFold, { count: r.count })}
        </Text>
      );
    }
    const ln = r.type === 'del' ? r.aLn : r.bLn;
    const gutter = String(ln).padStart(gutterW);
    return (
      <Text key={k} wrap="truncate-end">
        <Text dimColor>{gutter} </Text>
        <Text color={colorFor(r.type)}>{prefixFor(r.type)} {r.text}</Text>
      </Text>
    );
  };

  const summary = (added === 0 && removed === 0)
    ? t.DiffNoChanges
    : tfmt(t.DiffSummary, { added, removed });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold wrap="truncate-end">{title}</Text>
      {hasAbove && <Text dimColor>{tfmt(t.MoreAbove, { count: scrollClamped })}</Text>}
      {rows.length === 0
        ? <Text dimColor>{t.DiffNoChanges}</Text>
        : visible.map(renderRow)
      }
      {hasBelow && <Text dimColor>{tfmt(t.MoreBelow, { count: belowCount })}</Text>}
      <Text dimColor wrap="truncate-end">{summary} · {navHint}</Text>
    </Box>
  );
}
