import React from 'react';
import { Box, Text, useStdout } from 'ink';

// Pozioma linia na całą szerokość terminala (domyślnie w kolorze tytułu).
export default function Divider({ color = '#4da3ff' }) {
  const { stdout } = useStdout();
  const width = Math.max(1, stdout?.columns || 80);
  return (
    <Box>
      <Text color={color}>{'─'.repeat(width)}</Text>
    </Box>
  );
}
