import React from 'react';
import { Box, Text } from 'ink';

// Paleta slash-komend z autouzupełnianiem. Renderowanie sterowane z App:
// `items` to przefiltrowana lista, `index` to podświetlona pozycja.
export default function CommandPalette({ items, index }) {
  if (!items.length) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray" dimColor>brak pasujących komend — wpisz /help</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      {items.map((c, i) => (
        <Text key={c.name} color={i === index ? 'black' : 'yellow'} backgroundColor={i === index ? 'yellow' : undefined}>
          {i === index ? '› ' : '  '}{c.name}
          <Text color={i === index ? 'black' : 'gray'}>   {c.desc}</Text>
        </Text>
      ))}
    </Box>
  );
}
