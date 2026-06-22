import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Animowany spinner ASCII (braille). Sam zarządza własnym interwałem.
export default function Spinner({ color = 'cyan', interval = 80 }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % FRAMES.length), interval);
    return () => clearInterval(t);
  }, [interval]);
  return <Text color={color}>{FRAMES[i]}</Text>;
}
