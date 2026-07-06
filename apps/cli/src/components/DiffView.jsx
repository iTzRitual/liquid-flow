import { Box, Text, useInput } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';
import { tfmt, buildDiffRows } from '@liquidflow/core';

// A scrollable diff preview (line diff) before resolving a conflict.
// Occupies exactly `maxRows + 4` rows (chrome: frame 2 + title 1 + footer 1).
// Navigation: ↑/↓ line scroll, PgUp/PgDn fast scroll, Esc to go back.
//
// Three readability measures (important — without them, deeply nested templates
// fall apart on screen):
//  1. **Sanitization** of each line (`sanitize`): tabs → 2 spaces + removal of
//     control characters (\r, ANSI, etc. — see below).
//  2. **Common indent (dedent)** — we strip the minimal indent of visible content
//     lines, so deeply nested code shifts left and the tag is visible instead of
//     just spaces (with `truncate-end`, which keeps the LEFT side of the line).
//  3. **Context folding** (`buildDiffRows`) — we show only ±N lines around
//     changes, the rest as "N unchanged" — changes do not get lost in a sea of context.
const TAB = '  '; // tab → 2 spaces (compact for deep nesting)
// Sanitizing a row for a safe terminal render:
//  - tabs → 2 spaces (Ink measures \t as 1 column, the terminal renders up to 8 → staircasing),
//  - control characters are REMOVED (after tab expansion there is no more 0x09): \r
//    moves the cursor to the start of the row and breaks the frame (the main bug
//    with CRLF files), and ANSI sequences (0x1b) in the content could inject
//    colors/cursor movement. Only printable text remains.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]/g;
const sanitize = (s) => (s || '').replace(/\t/g, TAB).replace(CONTROL, '');
const leadSpaces = (s) => { const m = /^ */.exec(s); return m ? m[0].length : 0; };

// `expanded`/`onToggleExpand` are driven by the parent (App.jsx keeps them in
// `mode`), because expanding MUST enlarge the overlay (naturalBodyRows depends on
// `mode.expanded`). If the state lived here locally, the window could not grow —
// the content would be squeezed into the collapsed row budget (1 entry + "↓ more").
export default function DiffView({ title, preview, onCancel, maxRows = 8, expanded = false, onToggleExpand, onOpenIde, t }) {
  const [scroll, setScroll] = useState(0); // rows from the top (0 = start)
  // after toggling collapse/expand the row set changes — return to the top
  useEffect(() => { setScroll(0); }, [expanded]);

  const isText = preview?.kind === 'text';

  // Rows to render: line numbers + (collapsed | full) context, after sanitizing
  // and dedenting. Computed from preview + `expanded` (memo). `collapsible` is
  // computed from the ALWAYS-collapsed version, so the Tab hint stays stable while
  // toggling (visible exactly when there is something to expand).
  const { rows, gutterW, collapsible } = useMemo(() => {
    if (!isText) return { rows: [], gutterW: 1, collapsible: false };
    const built = buildDiffRows(preview.diff, { context: 3, fold: !expanded });
    const collapsible = buildDiffRows(preview.diff, { context: 3 }).some((r) => r.type === 'fold');
    const clean = built.map((r) => (r.type === 'fold' ? r : { ...r, text: sanitize(r.line) }));
    // common indent computed only from non-blank content lines (blank/fold are skipped)
    const content = clean.filter((r) => r.type !== 'fold' && r.text.trim().length > 0);
    const minIndent = content.length ? Math.min(...content.map((r) => leadSpaces(r.text))) : 0;
    const dedented = clean.map((r) => (r.type === 'fold' ? r : { ...r, text: r.text.slice(minIndent) }));
    // gutter width = digit count of the largest line number
    const totalA = preview.diff.filter((d) => d.type !== 'add').length; // local (ctx+del)
    const totalB = preview.diff.filter((d) => d.type !== 'del').length; // remote (ctx+add)
    return { rows: dedented, gutterW: String(Math.max(1, totalA, totalB)).length, collapsible };
  }, [isText, preview, expanded]);

  const added = isText ? preview.diff.filter((l) => l.type === 'add').length : 0;
  const removed = isText ? preview.diff.filter((l) => l.type === 'del').length : 0;

  // We do not use an "↑ N more" indicator — every downward press reveals exactly
  // 1 new line. An indicator above the content took a row from the budget and made
  // the first downward press show only the indicator instead of a new line.
  const maxScroll = Math.max(0, rows.length - maxRows);
  const scrollClamped = Math.min(scroll, maxScroll);

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (key.tab && collapsible) { onToggleExpand?.(); return; }
    if (input === 'o' && onOpenIde) { onOpenIde(); return; }
    if (key.upArrow) { setScroll((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setScroll((s) => Math.min(maxScroll, s + 1)); return; }
    if (key.pageUp) { setScroll((s) => Math.max(0, s - Math.max(1, maxRows))); return; }
    if (key.pageDown) { setScroll((s) => Math.min(maxScroll, s + Math.max(1, maxRows))); return; }
  });

  const navHint = t.PickerEsc;

  if (preview?.kind === 'binary') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold wrap="truncate-end">{title}</Text>
        <Text dimColor>{t.DiffBinary}</Text>
        <Text dimColor>{navHint}</Text>
      </Box>
    );
  }

  if (preview?.kind === 'tooLarge') {
    const ideHint = onOpenIde ? `${t.DiffOpenIde} · ` : '';
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold wrap="truncate-end">{title}</Text>
        <Text dimColor>{t.DiffTooLarge}</Text>
        <Text dimColor>{ideHint}{navHint}</Text>
      </Box>
    );
  }

  // Window of visible rows: only the ↓ (bottom) indicator takes 1 row from the
  // budget. No top indicator eliminates "stickiness" — every downward press reveals
  // exactly 1 new line (the gutter numbers show where you are).
  const hasBelow = scrollClamped + maxRows < rows.length;
  const avail = maxRows - (hasBelow ? 1 : 0);
  // At the end of the content: fill from the bottom, to avoid blank rows.
  const start = Math.min(scrollClamped, Math.max(0, rows.length - avail));
  const end = Math.min(rows.length, start + avail);
  const visible = rows.slice(start, end);
  const belowCount = rows.length - end;

  const colorFor = (type) => (type === 'add' ? 'green' : type === 'del' ? 'red' : undefined);
  const prefixFor = (type) => (type === 'add' ? '+' : type === 'del' ? '-' : ' ');
  const blankGutter = ' '.repeat(gutterW);

  // Renders a single diff row. The line number (gutter) is dimmed; the content in
  // the type's color. The whole <Text> has `truncate-end` — after sanitizing, Ink
  // measures the width correctly, so it cuts exactly at the frame boundary (no wrap/staircasing).
  const renderRow = (r, k) => {
    if (r.type === 'fold') {
      return (
        <Text key={k} dimColor wrap="truncate-end">
          {blankGutter}  {tfmt(t.DiffFold, { count: r.count })}
        </Text>
      );
    }
    const ln = r.type === 'del' ? r.aLn : r.bLn;
    const gutter = String(ln).padStart(gutterW);
    return (
      <Text key={k} wrap="truncate-end">
        <Text dimColor>{gutter} </Text>
        <Text color={colorFor(r.type)}>{prefixFor(r.type)} {r.text}</Text>
      </Text>
    );
  };

  const summary = (added === 0 && removed === 0)
    ? t.DiffNoChanges
    : tfmt(t.DiffSummary, { added, removed });
  const toggleHint = collapsible ? `${expanded ? t.DiffHideContext : t.DiffShowContext} · ` : '';
  const ideHint = onOpenIde ? `${t.DiffOpenIde} · ` : '';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold wrap="truncate-end">{title}</Text>
      {rows.length === 0
        ? <Text dimColor>{t.DiffNoChanges}</Text>
        : visible.map(renderRow)
      }
      {hasBelow && <Text dimColor>{tfmt(t.MoreBelow, { count: belowCount })}</Text>}
      <Text dimColor wrap="truncate-end">{summary} · {toggleHint}{ideHint}{navHint}</Text>
    </Box>
  );
}
