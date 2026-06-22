import React from 'react';
import { Box, Text } from 'ink';

// Nagłówek po prawej od logo. Pokazujemy tylko to, co istnieje:
//  - niepołączony       -> '~'
//  - połączony          -> Sklep
//  - po wyborze szablonu-> Szablon
//  - Git tylko gdy aktywny
// Konflikty NIE są tutaj — renderowane osobno (dolna linia, do prawej, czerwone).
export default function StatusBar({ state, git }) {
  const shop = state?.currentShop;
  const tpl = state?.currentTemplate;

  return (
    <Box flexDirection="column">
      <Text color="#4da3ff" bold>Liquid Flow CLI 0.9</Text>

      {shop
        ? <Box><Text color="gray">Sklep:   </Text><Text color="green" wrap="truncate-end">● {shop.Name}  <Text color="gray">{shop.Url}</Text></Text></Box>
        : <Text color="gray">~</Text>}

      {tpl && (
        <Box>
          <Text color="gray">Szablon: </Text>
          <Text wrap="truncate-end"><Text color="cyan">{tpl.Name}</Text><Text color="gray"> [{tpl.Id}]  </Text><Text color="green">⏺ sync żywy</Text></Text>
        </Box>
      )}

      {git?.active && (
        <Box>
          <Text color="gray">Git:     </Text>
          {git.autoCommit ? <Text color="green">commit ✓ </Text> : <Text color="gray">commit ✗ </Text>}
          {git.autoPush ? <Text color="green">push ✓</Text> : <Text color="gray">push ✗</Text>}
        </Box>
      )}
    </Box>
  );
}
