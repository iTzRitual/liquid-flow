import { Box, Text, useInput } from 'ink';
import React, { useEffect } from 'react';

// A short, self-dismissing message (e.g. "no conflicts") — instead of a log flash
// (visible for a fraction of a second), we show it as a screen for `duration` ms,
// dismissible by ANY key. `onDismiss` is called once — whether from the timeout or a key.
export default function InfoScreen({ title, message, duration = 4000, onDismiss, color = 'green', t }) {
  useEffect(() => {
    const timeout = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(timeout);
  }, [duration, onDismiss]);

  useInput(() => { onDismiss?.(); });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      {title && <Text color={color} bold>{title}</Text>}
      <Text>{message}</Text>
      <Text dimColor>{t.InfoAnyKeyClose}</Text>
    </Box>
  );
}
