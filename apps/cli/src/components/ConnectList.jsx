import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';
import { tfmt } from '@liquidflow/core';
import { windowList } from '../window.js';

// The shop connection screen. Two zones in ONE navigation sequence:
//   1) the list of saved shops (one per row, ↑/↓),
//   2) footer: a blank line + ONE row of action buttons (Disconnect / Add /
//      Remove), selected with ←/→ — but ↑/↓ also cycles through them, in the
//      same order (last shop ↓ → first button; first button ↑ → last shop).
//      Enter: on a shop, connects; on a button, runs the action.
//   shops:   [{ label, hint?, shop }]
//   actions: [{ key, label }]   (footer; at least "add")
const FOOTER_LINES = 2; // blank line + button row

export default function ConnectList({ title, shops, actions, onShop, onAction, onCancel, onSlash, maxRows = 12, initialIndex = 0, onIndexChange, t }) {
  const nShops = shops.length;
  const nAct = actions.length;
  const total = nShops + nAct;
  // 0..nShops-1 = shops, beyond that = actions. `initialIndex` restores the
  // position after returning via Esc from a screen opened from this list (cursor memory in App).
  const [i, setI] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, total - 1)));
  useEffect(() => { onIndexChange?.(i); }, [i]); // report the position to the parent

  const inFooter = i >= nShops;
  const actIdx = i - nShops; // only when inFooter

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (onSlash && input === '/') { onSlash(); return; }
    if (!total) return;
    if (key.upArrow) { setI((p) => (p - 1 + total) % total); return; }
    if (key.downArrow) { setI((p) => (p + 1) % total); return; }
    // ←/→ move only within the footer (cycling through the buttons)
    if (inFooter && nAct) {
      if (key.leftArrow) { setI(nShops + ((actIdx - 1 + nAct) % nAct)); return; }
      if (key.rightArrow) { setI(nShops + ((actIdx + 1) % nAct)); return; }
    }
    if (key.return) {
      if (inFooter) onAction?.(actions[actIdx].key);
      else onShop?.(shops[i].shop);
    }
  });

  // windowing the shop list (budget = total height minus the footer)
  const budget = Math.max(1, maxRows - FOOTER_LINES);
  const focus = nShops ? Math.min(i, nShops - 1) : 0;
  const w = windowList(nShops, focus, budget);
  const slice = shops.slice(w.start, w.start + w.count);

  const help = [t.PickerNav, t.PickerChoose, t.PickerEnter, t.PickerEsc, onSlash ? t.PickerSlash : null]
    .filter(Boolean).join(' · ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {nShops > 0 && (
        <>
          {w.above > 0 && <Text dimColor>{tfmt(t.MoreAbove, { count: w.above })}</Text>}
          {slice.map((s, k) => {
            const idx = w.start + k;
            const sel = idx === i;
            return (
              <Text key={idx} color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined} wrap="truncate-end">
                {sel ? '› ' : '  '}{s.label}
                {s.hint ? <Text color={sel ? 'black' : 'gray'}>  {s.hint}</Text> : null}
              </Text>
            );
          })}
          {w.below > 0 && <Text dimColor>{tfmt(t.MoreBelow, { count: w.below })}</Text>}
        </>
      )}
      <Text> </Text>
      <Box>
        {actions.map((a, ai) => {
          const sel = inFooter && ai === actIdx;
          return (
            <Text key={a.key} color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined}> {a.label} </Text>
          );
        })}
      </Box>
      <Text dimColor>{help}</Text>
    </Box>
  );
}
