import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// An animated ASCII (braille) spinner. Manages its own interval.
export default function Spinner({ color = 'cyan', interval = 80 }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % FRAMES.length), interval);
    return () => clearInterval(t);
  }, [interval]);
  return <Text color={color}>{FRAMES[i]}</Text>;
}
