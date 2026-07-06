import React from 'react';
import { Box, Text, useStdout } from 'ink';

// A horizontal line spanning the full terminal width — the '─' character (U+2500),
// like the divider in the Antigravity CLI. Color: a lighter shade of the title blue.
export default function Divider({ color = '#82bbff' }) {
  const { stdout } = useStdout();
  const width = Math.max(1, stdout?.columns || 80);
  return (
    <Box>
      <Text color={color}>{'─'.repeat(width)}</Text>
    </Box>
  );
}
