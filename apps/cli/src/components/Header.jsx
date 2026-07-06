import React from 'react';
import { Box, Text } from 'ink';
import { tfmt } from '@liquidflow/core';
import Banner from './Banner.jsx';
import StatusBar from './StatusBar.jsx';

// Below this width the header stops being 2 columns and stacks into 2 rows
// (logo above the info) — otherwise the info column would be too cramped.
export const HEADER_STACK_COLS = 52;

// Header = 2 columns: LOGO and INFO.
//  - logo: fixed, never shrinks or wraps (flexShrink=0),
//  - info: a single column taking the rest of the width (flexGrow=1). Inside, the
//    status rows (title/shop/template/git, left-aligned) sit at the top, and the
//    conflicts indicator (right-aligned) sticks to the bottom — justifyContent
//    space-between spreads them vertically. Conflicts are a SEPARATE row of the
//    same column, so they do not squeeze the status rows (this is not a third column).
// On a very narrow window (cols < HEADER_STACK_COLS) we switch to a vertical
// layout: logo on top, info below it (at full width).
export default function Header({ state, git, mismatches, cols = 80, t, compact = false }) {
  const conflicts = mismatches?.length || 0;
  const stacked = cols < HEADER_STACK_COLS;

  // Compact variant (low window): one row instead of the logo —
  // "Liquid Flow │ ● Shop │ Template │ ⚠ N", truncated as a whole.
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
    // 2 rows: logo, and below it info at full width.
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

  // 2 columns: logo | info.
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
