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

// Barwa znaku z jego odległości od środka logo: gradient promienisty — wzór
// „startuje" w środku (czerwień) i rozchodzi się tęczą aż do krawędzi (fiolet).
// Znaki w terminalu są ~2x wyższe niż szersze, więc oś Y skalujemy.
function hueFor(x, y, cx, cy, maxDist) {
  const dx = x - cx;
  const dy = (y - cy) * 2;
  const d = Math.sqrt(dx * dx + dy * dy);
  const t = maxDist === 0 ? 0 : d / maxDist; // 0 (środek) .. 1 (krawędź)
  return t * 300;                            // czerwień 0° -> fiolet 300°
}

// Banner: blokowy art z proceduralnym gradientem tęczowym (kolor per znak).
export default function Banner() {
  const width = Math.max(...ART.map((l) => l.length));
  const height = ART.length;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  // Maks. odległość od środka (róg) — normalizacja gradientu.
  const maxDist = Math.sqrt(cx * cx + (cy * 2) * (cy * 2));
  return (
    <Box flexDirection="column">
      {ART.map((line, y) => (
        <Text key={y}>
          {[...line].map((ch, x) =>
            ch === ' '
              ? <Text key={x}> </Text>
              : <Text key={x} color={hslToHex(hueFor(x, y, cx, cy, maxDist), 95, 60)}>{ch}</Text>)}
        </Text>
      ))}
    </Box>
  );
}
