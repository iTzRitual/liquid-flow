import React from 'react';
import { Box, Text, useStdout } from 'ink';

// Cienka pozioma linia na całą szerokość terminala. Zamiast znaku '─' (gruby)
// używamy podkreślenia rzędu spacji — daje delikatną kreskę u dołu wiersza
// (jak divider w Antigravity CLI).
export default function Divider({ color = '#8fc2ff' }) {
  const { stdout } = useStdout();
  const width = Math.max(1, stdout?.columns || 80);
  return (
    <Box>
      <Text color={color} underline>{' '.repeat(width)}</Text>
    </Box>
  );
}
