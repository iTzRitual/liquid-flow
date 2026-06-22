import React from 'react';
import { Box, Text } from 'ink';

// Nagłówek po prawej od logo: nazwa aplikacji (niebieska). Linie sklep/szablon/
// konflikty/git pokazujemy dopiero po połączeniu — gdy niepołączony, pusto.
export default function StatusBar({ state, mismatches, git }) {
  const shop = state?.currentShop;
  const tpl = state?.currentTemplate;
  const conflicts = mismatches?.length || 0;

  return (
    <Box flexDirection="column">
      <Text color="#4da3ff" bold>Liquid Flow CLI 0.9</Text>

      {shop && (
        <>
          <Box>
            <Text color="gray">Sklep:   </Text>
            <Text color="green">● {shop.Name}  <Text color="gray">{shop.Url}</Text></Text>
          </Box>

          <Box>
            <Text color="gray">Szablon: </Text>
            {tpl
              ? <Text><Text color="cyan">{tpl.Name}</Text><Text color="gray"> [{tpl.Id}]  </Text><Text color="green">⏺ sync żywy</Text></Text>
              : <Text color="gray">— brak (/templates)</Text>}
          </Box>

          <Box>
            <Text color="gray">Konflikty: </Text>
            <Text color={conflicts ? 'yellow' : 'green'}>{conflicts ? `${conflicts} (/files)` : '0'}</Text>
            <Text color="gray">   Git: </Text>
            {git?.active
              ? <Text>
                  {git.autoCommit ? <Text color="green">commit ✓ </Text> : <Text color="gray">commit ✗ </Text>}
                  {git.autoPush ? <Text color="green">push ✓</Text> : <Text color="gray">push ✗</Text>}
                </Text>
              : <Text color="gray">—</Text>}
          </Box>
        </>
      )}
    </Box>
  );
}
