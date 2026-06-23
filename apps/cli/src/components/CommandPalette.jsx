import React from 'react';
import { Box, Text } from 'ink';
import { windowList } from '../window.js';

// Paleta slash-komend z autouzupełnianiem. Renderowanie sterowane z App:
// `items` to przefiltrowana lista, `index` to podświetlona pozycja. `maxRows`
// ogranicza wysokość — przy dłuższej liście okno przewija się za zaznaczeniem.
export default function CommandPalette({ items, index, maxRows = 12 }) {
  if (!items.length) {
    return (
      <Box paddingX={1}>
        <Text color="gray" dimColor>brak pasujących komend</Text>
      </Box>
    );
  }
  const w = windowList(items.length, index, maxRows);
  const slice = items.slice(w.start, w.start + w.count);
  return (
    <Box flexDirection="column" paddingX={1}>
      {w.above > 0 && <Text color="gray" dimColor>↑ {w.above} więcej</Text>}
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
      {w.below > 0 && <Text color="gray" dimColor>↓ {w.below} więcej</Text>}
    </Box>
  );
}
