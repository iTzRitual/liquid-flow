import React from 'react';
import { Box, Text, useStdout } from 'ink';

// Pozioma linia na całą szerokość terminala — znak '─' (U+2500), jak divider
// w Antigravity CLI. Kolor: jaśniejszy odcień niebieskiego tytułu.
export default function Divider({ color = '#82bbff' }) {
  const { stdout } = useStdout();
  const width = Math.max(1, stdout?.columns || 80);
  return (
    <Box>
      <Text color={color}>{'─'.repeat(width)}</Text>
    </Box>
  );
}
