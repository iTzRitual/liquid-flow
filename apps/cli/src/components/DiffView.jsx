import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { tfmt } from '@liquidflow/core';

// Przewijany podgląd różnic (line diff) przed rozwiązaniem konfliktu.
// Zajmuje dokładnie `maxRows + 4` wierszy (chrome: ramka 2 + tytuł 1 + stopka 1).
// Nawigacja: ↑/↓ przewijanie linii, PgUp/PgDn szybki przewijanie, Esc wróć.
export default function DiffView({ title, preview, onCancel, maxRows = 8, t }) {
  const [scroll, setScroll] = useState(0); // wiersze od góry (0 = początek)

  const lines = (preview?.kind === 'text' ? preview.diff : null) || [];
  const added = lines.filter((l) => l.type === 'add').length;
  const removed = lines.filter((l) => l.type === 'del').length;

  // +1 żeby przy scroll=maxScroll górny wskaźnik „↑" był widoczny obok ostatnich
  // wierszy treści (analogia do LogPane maxScroll = total - rows + 1).
  const maxScroll = Math.max(0, lines.length - maxRows + 1);
  const scrollClamped = Math.min(scroll, maxScroll);

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (key.upArrow) { setScroll((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setScroll((s) => Math.min(maxScroll, s + 1)); return; }
    if (key.pageUp) { setScroll((s) => Math.max(0, s - Math.max(1, maxRows))); return; }
    if (key.pageDown) { setScroll((s) => Math.min(maxScroll, s + Math.max(1, maxRows))); return; }
  });

  // Krótka wersja stopki nawigacyjnej
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

  // Obliczenie okna widocznych linii z symetrycznymi wskaźnikami ↑/↓.
  const hasAbove = scrollClamped > 0;
  const avail0 = maxRows - (hasAbove ? 1 : 0);
  const hasBelow = scrollClamped + avail0 < lines.length;
  const avail = hasBelow ? avail0 - 1 : avail0;
  const visible = lines.slice(scrollClamped, scrollClamped + Math.max(0, avail));
  const belowCount = lines.length - scrollClamped - Math.max(0, avail);

  const colorFor = (type) => (type === 'add' ? 'green' : type === 'del' ? 'red' : undefined);
  const prefixFor = (type) => (type === 'add' ? '+' : type === 'del' ? '-' : ' ');

  const summary = (added === 0 && removed === 0)
    ? t.DiffNoChanges
    : tfmt(t.DiffSummary, { added, removed });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {hasAbove && <Text dimColor>{tfmt(t.MoreAbove, { count: scrollClamped })}</Text>}
      {lines.length === 0
        ? <Text dimColor>{t.DiffNoChanges}</Text>
        : visible.map((l, k) => (
          <Text key={k} color={colorFor(l.type)} wrap="truncate-end">
            {prefixFor(l.type)} {l.line}
          </Text>
        ))
      }
      {hasBelow && <Text dimColor>{tfmt(t.MoreBelow, { count: belowCount })}</Text>}
      <Text dimColor>{summary} · {navHint}</Text>
    </Box>
  );
}
