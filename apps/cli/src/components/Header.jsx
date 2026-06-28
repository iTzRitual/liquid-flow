import React from 'react';
import { Box, Text } from 'ink';
import { tfmt } from '@liquidflow/core';
import Banner from './Banner.jsx';
import StatusBar from './StatusBar.jsx';

// Poniżej tej szerokości nagłówek przestaje być 2 kolumnami i układa się w
// 2 wiersze (logo nad informacjami) — inaczej kolumna informacji jest za ciasna.
export const HEADER_STACK_COLS = 52;

// Nagłówek = 2 kolumny: LOGO i INFORMACJE.
//  - logo: stałe, nigdy się nie kurczy ani nie zawija (flexShrink=0),
//  - informacje: jedna kolumna zabierająca resztę szerokości (flexGrow=1).
//    W środku wiersze statusu (tytuł/sklep/szablon/git, do lewej) u góry, a
//    wskaźnik konfliktów (do prawej) przyklejony do dołu — justifyContent
//    space-between rozsuwa je w pionie. Konflikty są w OSOBNYM wierszu tej samej
//    kolumny, więc nie ściskają wierszy statusu (to nie trzecia kolumna).
// Przy bardzo wąskim oknie (cols < HEADER_STACK_COLS) przełączamy się na układ
// pionowy: logo na górze, informacje pod spodem (na pełną szerokość).
export default function Header({ state, git, mismatches, cols = 80, t, compact = false }) {
  const conflicts = mismatches?.length || 0;
  const stacked = cols < HEADER_STACK_COLS;

  // Wariant compact (niskie okno): jeden wiersz zamiast logo —
  // „Liquid Flow │ ● Sklep │ Szablon │ ⚠ N", przycinany jako całość.
  if (compact) {
    const shop = state?.currentShop;
    const tpl = state?.currentTemplate;
    return (
      <Box paddingLeft={1}>
        <Text wrap="truncate-end">
          <Text color="#4da3ff" bold>Liquid Flow</Text>
          {shop
            ? <Text><Text dimColor> │ </Text><Text color="green">● {shop.Name}</Text></Text>
            : <Text><Text dimColor> │ </Text><Text dimColor>~</Text></Text>}
          {tpl && <Text><Text dimColor> │ </Text><Text color="cyan">{tpl.Name}</Text></Text>}
          {conflicts > 0 && <Text><Text dimColor> │ </Text><Text color="red">{tfmt(t.ConflictsShort, { count: conflicts })}</Text></Text>}
        </Text>
      </Box>
    );
  }

  const conflictRow = conflicts > 0 ? (
    <Box justifyContent="flex-end">
      <Text color="red" wrap="truncate-end">{tfmt(t.ConflictsIndicator, { count: conflicts })}</Text>
    </Box>
  ) : null;

  if (stacked) {
    // 2 wiersze: logo, a pod nim informacje na pełną szerokość.
    return (
      <Box marginTop={1} flexDirection="column">
        <Box paddingLeft={1} flexShrink={0}><Banner /></Box>
        <Box marginTop={1} paddingLeft={1} flexDirection="column">
          <StatusBar state={state} git={git} t={t} />
          {conflictRow}
        </Box>
      </Box>
    );
  }

  // 2 kolumny: logo | informacje.
  return (
    <Box marginTop={1}>
      <Box paddingLeft={1} flexShrink={0}><Banner /></Box>
      <Box marginLeft={3} marginTop={1} flexGrow={1} flexShrink={1} flexDirection="column" justifyContent="space-between">
        <StatusBar state={state} git={git} t={t} />
        {conflictRow}
      </Box>
    </Box>
  );
}
