import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';
import { tfmt } from '@liquidflow/core';

// The conflicts screen. Each file is a CARD with an ADAPTIVE height `cardH`:
//   cardH=3: name+buttons / meta (timestamps) / note (which side is newer)
//   cardH=2: name+buttons / meta               (on a low window)
//   cardH=1: name+buttons only                 (extremely low window)
// **The name+buttons row is ALWAYS rendered** — it carries the action, so even on a
// very low window the file name stays visible (only meta/note degrade).
// The spacing is BETWEEN cards (`sep`), NOT after the last one — this way the top
// and bottom "↑/↓ more" indicators sit symmetrically against the content (formerly
// a trailing blank card line gave the bottom indicator extra spacing → asymmetry).
// At the bottom — a fixed footer: one row of bulk operations ("Download/Upload
// all").
// Navigation: ↑/↓ between cards and the footer, ←/→
// selects an action in the row, Enter runs it, Esc cancels.
//   files: [{ name, meta, note, options:[{label,value}], initial }]
//   bulk:  [{ label, value }]  (optional)
//
// **Fixed screen height (do NOT break!)**: the card region ALWAYS occupies exactly
// `regionTarget = maxRows − footer` rows, regardless of cursor position — otherwise
// the screen (stuck to the bottom) would change height on every ↑/↓ and shift the
// log above it ("jumping"). The fixed height comes from four things: (1) the number
// of visible cards `cap` AND their height `cardH` depend only on `regionTarget`, NOT
// on the cursor; (2) every visible card renders EXACTLY `cardH` rows (a missing note
// → a blank line); (3) both "↑/↓ more" indicators occupy 1 row each (an empty slot
// when absent); (4) the region is padded with blank lines up to `regionTarget`.
// Test: `apps/cli/src/components/ConflictList.test.jsx`.
//
// The ←/→ cursor belongs EXCLUSIVELY to the current row and is NOT remembered — on
// entering a card (↑/↓) it starts from the safe default choice (`initial`). Only
// Enter matters (it acts immediately on the current card), so remembering the
// position on other cards would add nothing. All buttons are full-contrast;
// highlighting (cyan background) is applied only to the current row's cursor.

export default function ConflictList({ title, files, bulk, onAction, onBulk, onCancel, maxRows = 12, initialIndex = 0, onIndexChange, t }) {
  const hasBulk = Array.isArray(bulk) && bulk.length > 0;
  const rows = files.length + (hasBulk ? 1 : 0);

  const optsFor = (idx) => (idx < files.length ? files[idx].options : bulk) || [];
  const initFor = (idx) => (idx < files.length ? (files[idx].initial ?? 0) : 0);

  // `initialIndex` restores the highlighted card after returning via Esc from a
  // preview/confirmation opened from this list (App keeps the index on the parent mode).
  // The ←/→ cursor is STILL NOT remembered — it starts from the safe `initFor`.
  const startRow = Math.min(Math.max(0, initialIndex), Math.max(0, rows - 1));
  const [i, setI] = useState(startRow);
  const [cursor, setCursor] = useState(() => initFor(startRow)); // ←/→ position of the current row only
  useEffect(() => { onIndexChange?.(i); }, [i]); // report the position to the parent (card memory)

  // cursor clamped to the current row's option count (e.g. after a list refresh)
  const curOpts = optsFor(i);
  const curCursor = Math.max(0, Math.min(cursor, curOpts.length - 1));

  const bulkFocused = hasBulk && i === files.length;

  // ↑/↓ — in the footer, moves the cursor between buttons (just like ←/→); at the
  // file list ↔ footer boundary, jumps as in ConnectList.
  const moveRow = (delta) => {
    if (bulkFocused) {
      const next = curCursor + delta;
      if (next < 0) {
        if (files.length) { setI(files.length - 1); setCursor(initFor(files.length - 1)); }
      } else if (next >= bulk.length) {
        if (files.length) { setI(0); setCursor(initFor(0)); }
      } else {
        setCursor(next);
      }
      return;
    }
    const next = i + delta;
    if (hasBulk && next >= files.length) {
      setI(files.length); setCursor(0);
    } else if (hasBulk && next < 0) {
      setI(files.length); setCursor(bulk.length - 1);
    } else {
      const n = (next + files.length) % files.length;
      setI(n); setCursor(initFor(n));
    }
  };

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (!rows) return;
    if (key.upArrow) { moveRow(-1); return; }
    if (key.downArrow) { moveRow(1); return; }
    const n = curOpts.length || 1;
    if (key.leftArrow) { setCursor((c) => (Math.min(c, n - 1) - 1 + n) % n); return; }
    if (key.rightArrow) { setCursor((c) => (Math.min(c, n - 1) + 1) % n); return; }
    if (key.return) {
      const o = curOpts[curCursor];
      if (!o) return;
      if (i < files.length) onAction?.(o.value, files[i]);
      else onBulk?.(o.value);
    }
  });

  // Action buttons of a single card/footer. All full-contrast; the cursor
  // (only when the row is `focused`) is highlighted with a cyan background. `cv` = the cursor index.
  const renderButtons = (options, cv, focused) =>
    options.map((o, oi) => {
      const active = focused && oi === cv;
      return (
        <Text key={oi} color={active ? 'black' : undefined} backgroundColor={active ? 'cyan' : undefined}>
          {' '}{o.label}{' '}
        </Text>
      );
    });

  // Renders EXACTLY `cardH` rows (1–3). The name+buttons row always; meta from
  // cardH≥2; note (or a blank line when there is no note) from cardH≥3.
  const renderCard = (f, idx, cardH) => {
    const focused = idx === i;
    return (
      <Box key={idx} flexDirection="column">
        <Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text color={focused ? 'cyan' : undefined} wrap="truncate-end">
              {focused ? '› ' : '  '}{f.name}
            </Text>
          </Box>
          <Box flexShrink={0} marginLeft={2}>{renderButtons(f.options, curCursor, focused)}</Box>
        </Box>
        {cardH >= 2 && <Text dimColor wrap="truncate-end">  {f.meta}</Text>}
        {cardH >= 3 && (f.note
          ? <Text dimColor wrap="truncate-end">  {f.note}</Text>
          : <Text> </Text>)}
      </Box>
    );
  };

  // The card region has a FIXED height `regionTarget` (= total height minus the
  // footer), independent of cursor position. App budgets the box at `maxRows + 4`
  // (chrome = frame 2 + title 1 + footer + help 1), so the card region = `maxRows − footer`.
  const SEP = 1; // spacing BETWEEN cards (not after the last one → indicator symmetry)
  const footerLines = hasBulk ? 1 : 0;
  const regionTarget = Math.max(1, maxRows - footerLines);
  const fileFocus = files.length ? Math.min(i, files.length - 1) : 0;

  // Full view = all cards (cardH=3) with separators. When it does not fit, we
  // window it and degrade the card height to the available space.
  const fullAll = files.length * 3 + Math.max(0, files.length - 1) * SEP;
  const overflow = files.length > 0 && fullAll > regionTarget;

  let slice, above, below, cardH, sep, padLines, sliceStart, showIndicators;
  if (!overflow) {
    cardH = 3; sep = SEP; sliceStart = 0; above = 0; below = 0; showIndicators = false;
    slice = files;
    const content = files.length * cardH + Math.max(0, files.length - 1) * sep;
    padLines = Math.max(0, regionTarget - content);
  } else {
    // Indicator slots (2 rows) only when the region can fit them alongside ≥1 card;
    // on an extremely low window we drop them to avoid overflowing the frame.
    showIndicators = regionTarget >= 3;
    const reserve = showIndicators ? 2 : 0;
    // `avail` = room for cards after reserving the indicator slots.
    // `cardH`/`cap` are computed from `avail` (NOT from the cursor) → a fixed region height.
    const avail = Math.max(1, regionTarget - reserve);
    cardH = avail >= 3 ? 3 : avail >= 2 ? 2 : 1;
    sep = cardH >= 2 ? SEP : 0; // no spacing for 1-row cards (tight fit)
    let cap = Math.max(1, Math.floor((avail + sep) / (cardH + sep)));
    cap = Math.min(cap, files.length);
    while (cap > 1 && cap * cardH + (cap - 1) * sep > avail) cap--; // rounding correction
    const start = Math.max(0, Math.min(fileFocus - Math.floor(cap / 2), files.length - cap));
    above = start; below = files.length - (start + cap);
    slice = files.slice(start, start + cap); sliceStart = start;
    const content = cap * cardH + (cap - 1) * sep;
    padLines = Math.max(0, regionTarget - reserve - content);
  }

  const help = [t.PickerNav, t.PickerChoose, t.PickerEnter, t.PickerEsc].filter(Boolean).join(' · ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {files.length === 0
        ? <Text dimColor>{t.NoConflicts}</Text>
        : (
          <>
            {/* Both indicators are FIXED 1-row slots (empty when absent) —
                height symmetry regardless of cursor position. Cards have no
                trailing blank line (the spacing is BETWEEN them), so the top
                and bottom indicators sit symmetrically against the content. */}
            {showIndicators && <Text dimColor>{above > 0 ? tfmt(t.MoreAbove, { count: above }) : ' '}</Text>}
            {slice.map((f, k) => (
              <React.Fragment key={sliceStart + k}>
                {k > 0 && sep > 0 && <Text> </Text>}
                {renderCard(f, sliceStart + k, cardH)}
              </React.Fragment>
            ))}
            {showIndicators && <Text dimColor>{below > 0 ? tfmt(t.MoreBelow, { count: below }) : ' '}</Text>}
            {Array.from({ length: padLines }, (_, k) => <Text key={`pad${k}`}> </Text>)}
          </>
        )}
      {hasBulk && (
        <Box>
          {renderButtons(bulk, curCursor, bulkFocused)}
        </Box>
      )}
      <Text dimColor>{help}</Text>
    </Box>
  );
}
