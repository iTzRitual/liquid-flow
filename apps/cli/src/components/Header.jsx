import React from 'react';
import { Box, Text } from 'ink';
import Banner from './Banner.jsx';
import StatusBar from './StatusBar.jsx';

// Nagłówek = 2 kolumny: LOGO i INFORMACJE.
//  - logo: stałe, nigdy się nie kurczy ani nie zawija (flexShrink=0),
//  - informacje: jedna kolumna zabierająca resztę szerokości (flexGrow=1).
//    W środku wiersze statusu (tytuł/sklep/szablon/git, do lewej) u góry, a
//    wskaźnik konfliktów (do prawej) przyklejony do dołu — justifyContent
//    space-between rozsuwa je w pionie. Konflikty są w OSOBNYM wierszu tej samej
//    kolumny, więc nie ściskają wierszy statusu (to nie trzecia kolumna).
export default function Header({ state, git, mismatches }) {
  const conflicts = mismatches?.length || 0;
  return (
    <Box marginTop={1}>
      <Box paddingLeft={1} flexShrink={0}><Banner /></Box>
      <Box marginLeft={3} marginTop={1} flexGrow={1} flexShrink={1} flexDirection="column" justifyContent="space-between">
        <StatusBar state={state} git={git} />
        {conflicts > 0 && (
          <Box justifyContent="flex-end">
            <Text color="red" wrap="truncate-end">⚠ Konflikty: {conflicts} (/conflicts)</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
