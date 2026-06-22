import React from 'react';
import { Box, Text } from 'ink';

// Górny pasek statusu: zawsze widoczny. Pokazuje bieżący sklep, szablon, stan
// synchronizacji i Git.
export default function StatusBar({ state, mismatches, git, version }) {
  const shop = state?.currentShop;
  const tpl = state?.currentTemplate;
  const conflicts = mismatches?.length || 0;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Box>
        <Text color="#ff5a1f" bold>Liquid Flow </Text>
        <Text color="gray">v{version || '2.0.0'}</Text>
        {state?.insecureTLS ? <Text color="yellow">  ⚠ insecureTLS</Text> : null}
      </Box>
      <Box>
        <Text color="gray">Sklep:   </Text>
        {shop
          ? <Text color="green">● {shop.Name} </Text>
          : <Text color="gray">— brak (/login)</Text>}
        {shop ? <Text color="gray">{shop.Url}</Text> : null}
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
          ? <Text color="gray">
              {git.autoCommit ? <Text color="green">auto-commit ✓ </Text> : <Text color="gray">auto-commit ✗ </Text>}
              {git.autoPush ? <Text color="green">push ✓</Text> : <Text color="gray">push ✗</Text>}
            </Text>
          : <Text color="gray">— (/git)</Text>}
      </Box>
    </Box>
  );
}
