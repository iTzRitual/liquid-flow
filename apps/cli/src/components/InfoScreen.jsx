import { Box, Text, useInput } from 'ink';
import React, { useEffect } from 'react';

// Krótki, samodzielnie znikający komunikat (np. „brak konfliktów”) — zamiast
// migawki logu (widocznej ułamek sekundy), pokazujemy ją jako ekran na
// `duration` ms, pomijalny DOWOLNYM klawiszem. `onDismiss` woła się raz — czy
// to z timeoutu, czy z klawisza.
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
