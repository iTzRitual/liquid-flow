import React from 'react';
import { Box, Text } from 'ink';

// Nagłówek po prawej od logo. Pokazujemy tylko to, co istnieje:
//  - niepołączony       -> '~'
//  - połączony          -> Sklep
//  - po wyborze szablonu-> Szablon
//  - Git tylko gdy aktywny
// Konflikty NIE są tutaj — App.jsx przypina je do dołu kolumny nagłówka
// (puste pole obok logo), żeby ich pojawienie się nie spychało układu.
export default function StatusBar({ state, git }) {
  const shop = state?.currentShop;
  const tpl = state?.currentTemplate;

  // Każdy wiersz to pojedynczy <Text wrap="truncate-end"> — przy wąskim oknie
  // przycina się jako całość zamiast łamać etykiety/dokładać puste linie.
  return (
    <Box flexDirection="column">
      <Text color="#4da3ff" bold wrap="truncate-end">Liquid Flow CLI 0.9</Text>

      {shop
        ? <Text wrap="truncate-end"><Text color="gray">Sklep:   </Text><Text color="green">● {shop.Name}</Text><Text color="gray">  {shop.Url}</Text></Text>
        : <Text color="gray">~</Text>}

      {tpl && (
        <Text wrap="truncate-end"><Text color="gray">Szablon: </Text><Text color="cyan">{tpl.Name}</Text><Text color="gray"> [{tpl.Id}]</Text></Text>
      )}

      {git?.active && (
        <Text wrap="truncate-end">
          <Text color="gray">Git:     </Text>
          {git.autoCommit ? <Text color="green">commit ✓ </Text> : <Text color="gray">commit ✗ </Text>}
          {git.autoPush ? <Text color="green">push ✓</Text> : <Text color="gray">push ✗</Text>}
        </Text>
      )}
    </Box>
  );
}
