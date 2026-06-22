import React from 'react';
import { Box, Text, useStdout } from 'ink';

// Pozioma linia na całą szerokość terminala (jaśniejszy odcień tytułu).
export default function Divider({ color = '#8fc2ff' }) {
  const { stdout } = useStdout();
  const width = Math.max(1, stdout?.columns || 80);
  return (
    <Box>
      <Text color={color}>{'─'.repeat(width)}</Text>
    </Box>
  );
}
