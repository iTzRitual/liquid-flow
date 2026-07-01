import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';
import { tfmt } from '@liquidflow/core';

// Krótki, samodzielnie znikający komunikat (np. „brak konfliktów”) — zamiast
// migawki logu (widocznej ułamek sekundy), pokazujemy ją jako ekran na
// `duration` ms, z widocznym odliczeniem, i pozwalamy pominąć czas Enterem.
// `onDismiss` woła się raz — czy to z timeoutu, czy z Entera.
export default function InfoScreen({ title, message, duration = 4000, onDismiss, color = 'green', t }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(duration / 1000));

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((duration - (Date.now() - start)) / 1000));
      setSecondsLeft(left);
    }, 250);
    const timeout = setTimeout(() => onDismiss?.(), duration);
    return () => { clearInterval(tick); clearTimeout(timeout); };
  }, [duration, onDismiss]);

  useInput((input, key) => { if (key.return) onDismiss?.(); });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      {title && <Text color={color} bold>{title}</Text>}
      <Text>{message}</Text>
      <Text dimColor>{tfmt(t.InfoEnterClose, { seconds: secondsLeft })}</Text>
    </Box>
  );
}
