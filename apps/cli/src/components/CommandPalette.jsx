import React from 'react';
import { Box, Text } from 'ink';
import { tfmt } from '@liquidflow/core';
import { windowList } from '../window.js';

// The slash-command palette with autocomplete. Rendering is driven from App:
// `items` is the filtered list, `index` is the highlighted item. `maxRows` caps
// the height — with a longer list, the window scrolls with the selection.
export default function CommandPalette({ items, index, maxRows = 12, t }) {
  if (!items.length) {
    return (
      <Box paddingX={1}>
        <Text dimColor>{t.NoMatchingCommands}</Text>
      </Box>
    );
  }
  const w = windowList(items.length, index, maxRows);
  const slice = items.slice(w.start, w.start + w.count);
  return (
    <Box flexDirection="column" paddingX={1}>
      {w.above > 0 && <Text dimColor>{tfmt(t.MoreAbove, { count: w.above })}</Text>}
      {slice.map((c, k) => {
        const i = w.start + k;
        const sel = i === index;
        return (
          <Text key={c.name} color={sel ? 'black' : 'yellow'} backgroundColor={sel ? 'yellow' : undefined} wrap="truncate-end">
            {sel ? '› ' : '  '}{c.name}
            <Text color={sel ? 'black' : 'gray'}>   {c.desc}</Text>
          </Text>
        );
      })}
      {w.below > 0 && <Text dimColor>{tfmt(t.MoreBelow, { count: w.below })}</Text>}
    </Box>
  );
}
