import React from 'react';
import { readFileSync } from 'node:fs';
import { Box, Text } from 'ink';

// Version from the CLI package.json (single source of truth — bumping package.json
// is enough, no manually maintained literal).
const APP_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

// The header to the right of the logo. We show only what exists:
//  - disconnected        -> '~'
//  - connected           -> Shop
//  - after template select -> Template
//  - Git only when active
// Conflicts are NOT here — App.jsx pins them to the bottom of the header column
// (an empty slot next to the logo), so their appearance does not shift the layout.
export default function StatusBar({ state, git, t }) {
  const shop = state?.currentShop;
  const tpl = state?.currentTemplate;

  // Status labels (Shop/Template/Git) aligned to a common width — computed from
  // the length of the translated words, so the value column lines up in both languages.
  const labelW = Math.max(t.ShopLabel.length, t.TemplateLabel.length, t.GitLabel.length) + 1;
  const pad = (s) => s.padEnd(labelW);

  // Each row is a single <Text wrap="truncate-end"> — on a narrow window it
  // truncates as a whole instead of breaking the labels/adding blank lines.
  return (
    <Box flexDirection="column">
      <Text color="#4da3ff" bold wrap="truncate-end">Liquid Flow CLI {APP_VERSION}</Text>

      {shop
        ? <Text wrap="truncate-end"><Text color="gray">{pad(t.ShopLabel)}</Text><Text color="green">● {shop.Name}</Text><Text color="gray">  {shop.Url}</Text></Text>
        : <Text color="gray">~</Text>}

      {tpl && (
        <Text wrap="truncate-end"><Text color="gray">{pad(t.TemplateLabel)}</Text><Text color="cyan">{tpl.Name}</Text><Text color="gray"> [{tpl.Id}]</Text></Text>
      )}

      {git?.active && (
        <Text wrap="truncate-end">
          <Text color="gray">{pad(t.GitLabel)}</Text>
          {git.branch && <Text color="cyan">{git.branch}{git.ahead > 0 && <Text color="#ff5a1f"> +{git.ahead}</Text>}<Text color="gray"> · </Text></Text>}
          {git.autoCommit ? <Text color="green">commit ✓ </Text> : <Text color="gray">commit ✗ </Text>}
          {git.autoPush ? <Text color="green">push ✓</Text> : <Text color="gray">push ✗</Text>}
        </Text>
      )}
    </Box>
  );
}
