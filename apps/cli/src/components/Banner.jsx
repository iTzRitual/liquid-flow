import React from 'react';
import { Box, Text } from 'ink';
import { ART } from '../banner.js';

// HSL -> hex (reference algorithm). h: 0-360, s/l: 0-100.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

// A character's hue from its angle around the center — the gradient flows along a
// spiral: starting at the bottom-center (red), rotating through left, top, right and
// ending at the bottom-right (violet). Terminal characters are ~2x taller than wide,
// so we scale the Y axis to keep the angle geometrically correct.
function hueFor(x, y, cx, cy) {
  const dx = x - cx;
  const dy = (y - cy) * 2;
  let a = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180, bottom = +90°
  a = (a + 360) % 360;                          // 0..360
  // The seam (t=0) is shifted from vertical to the right, into the gap between the
  // spiral's tails, so the starting tip is entirely navy (not half navy/half magenta).
  const t = (a - 55 + 360) % 360;               // 0 = the gap, increases through left/top/right
  // Start = navy ~245°, then through cyan/green/yellow to red at the end.
  return ((245 - (t / 360) * 300) % 360 + 360) % 360;
}

// Banner: block art with a procedural rainbow gradient (per-character color).
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
