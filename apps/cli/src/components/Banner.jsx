import React from 'react';
import { Box, Text } from 'ink';
import { ART } from '../banner.js';

// HSL -> hex (algorytm referencyjny). h: 0-360, s/l: 0-100.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

// Barwa znaku z jego pozycji w poziomie: środek-góra czerwony, lewa zielona,
// prawa niebieska — tęczowy łuk jak w logo AGY/Claude.
function hueFor(x, width) {
  const cx = (width - 1) / 2;
  const t = cx === 0 ? 0 : (x - cx) / cx; // -1 (lewo) .. +1 (prawo)
  if (t <= 0) return -t * 135;            // środek (czerwony 0°) -> lewo (zieleń 135°)
  return 360 - t * 120;                   // środek (360≡0°) -> prawo (błękit 240°)
}

// Banner: blokowy art z proceduralnym gradientem tęczowym (kolor per znak).
export default function Banner() {
  const width = Math.max(...ART.map((l) => l.length));
  return (
    <Box flexDirection="column">
      {ART.map((line, y) => (
        <Text key={y}>
          {[...line].map((ch, x) =>
            ch === ' '
              ? <Text key={x}> </Text>
              : <Text key={x} color={hslToHex(hueFor(x, width), 95, 60)}>{ch}</Text>)}
        </Text>
      ))}
    </Box>
  );
}
