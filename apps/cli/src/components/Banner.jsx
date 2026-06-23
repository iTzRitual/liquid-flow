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

// Barwa znaku z jego kąta wokół środka — gradient płynie wzdłuż spirali:
// start na dole-środku (czerwień), obrót przez lewą, górę, prawą i koniec
// po prawej-dole (fiolet). Znaki w terminalu są ~2x wyższe niż szersze,
// więc oś Y skalujemy, żeby kąt był geometrycznie poprawny.
function hueFor(x, y, cx, cy) {
  const dx = x - cx;
  const dy = (y - cy) * 2;
  let a = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180, dół = +90°
  a = (a + 360) % 360;                          // 0..360
  const t = (a - 90 + 360) % 360;               // 0 = dół, rośnie przez lewą/górę/prawą
  return (t / 360) * 300;                        // czerwień 0° -> fiolet 300°
}

// Banner: blokowy art z proceduralnym gradientem tęczowym (kolor per znak).
export default function Banner() {
  const width = Math.max(...ART.map((l) => l.length));
  const height = ART.length;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  return (
    <Box flexDirection="column">
      {ART.map((line, y) => (
        <Text key={y}>
          {[...line].map((ch, x) =>
            ch === ' '
              ? <Text key={x}> </Text>
              : <Text key={x} color={hslToHex(hueFor(x, y, cx, cy), 95, 60)}>{ch}</Text>)}
        </Text>
      ))}
    </Box>
  );
}
