import React from 'react';
import { Box, Text } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { tfmt } from '@liquidflow/core';

// Maps core colors (hex) to Ink color names.
function inkColor(hex) {
  switch ((hex || '').toUpperCase()) {
    case '#F00': return 'red';
    case '#2A2': return 'green';
    // #FFF = the default entry: no color = the terminal's foreground (readable on
    // both dark AND light backgrounds; "white" disappeared on a white terminal).
    case '#FFF': return undefined;
    default: return 'gray';
  }
}

function hhmmss(ts) {
  try { return new Date(ts).toLocaleTimeString('pl-PL', { hour12: false }); }
  catch { return ''; }
}

// Builds the log's "visual rows" (the unit of scrolling).
//  - wrap=false (default): every entry = 1 row (truncated on render),
//  - wrap=true (/wrap): long entries wrap onto several rows — an alternative mode
//    where you can read the whole thing without opening a separate screen.
// Computed with the same `wrap-ansi`+hard as Ink, so the render matches row for row.
export function buildVlines(log, wrap, cols) {
  const w = Math.max(8, (cols || 80) - 2); // the Box has paddingX={1} → -2 columns
  const out = [];
  for (const e of log) {
    // A separator (e.g. a session boundary) — a divider line "── text ─────".
    if (e.kind === 'separator') {
      const label = `── ${e.Text} `;
      const fill = Math.max(0, w - [...label].length);
      out.push({ text: label + '─'.repeat(fill), color: '#82bbff', key: String(e.Id), trunc: true });
      continue;
    }
    const color = inkColor(e.Color);
    const dim = !!e.historic; // entries from the previous session — dimmed
    const text = `${hhmmss(e.TS)} ${e.Text}`;
    if (wrap) {
      wrapAnsi(text, w, { trim: false, hard: true }).split('\n')
        .forEach((t, i) => out.push({ text: t, color, dim, key: `${e.Id}:${i}` }));
    } else {
      out.push({ text, color, dim, key: String(e.Id), trunc: true });
    }
  }
  return out;
}

// The log panel on the main screen. Scrollable by wheel/arrows: `scroll` is the
// number of visual rows from the bottom (0 = newest at the bottom). Always fits
// within the `rows` budget — the "↑/↓ more" indicators take a row from the content
// window. `dim` grays out the WHOLE log (when it is the backdrop for an open
// palette/screen — context, not active content; the same effect as `historic` for the previous session).
export default function LogPane({ vlines, rows = 10, scroll = 0, t, dim = false }) {
  const total = vlines.length;
  // +1, because the "↓ newer" indicator at the top takes a row from the window —
  // otherwise the oldest entries (as many as the indicators occupy) could not be revealed.
  const maxScroll = total > rows ? total - rows + 1 : 0;
  const off = Math.min(Math.max(0, scroll), maxScroll);
  let end = total - off;

  const hasBelow = end < total;                 // scrolled up → there are newer entries below
  // Budget for entries = rows minus the indicators we actually show. We do NOT
  // floor `avail` to 1 — at `rows===1` with an "↑" indicator the entry budget must
  // drop to 0, otherwise indicator + entry = 2 rows exceeds `rows` (on overflow Ink
  // truncates/duplicates the frame). Better to show just the indicator.
  let avail = rows - (hasBelow ? 1 : 0);
  let start = Math.max(0, end - Math.max(0, avail));
  let hasAbove = start > 0;                      // there are older entries above
  if (hasAbove) {
    avail -= 1;
    if (hasBelow) {
      // Scrolling up: anchor to start (revealing older entries), trim end.
      // Side effect: the "↓ newer" indicator may show 1 more than the scroll offset
      // implies, because both indicators together shrink the content budget by 1.
      end = Math.min(end, start + Math.max(0, avail));
    } else {
      // At the bottom (scroll=0): anchor to end — show the newest entries.
      start = Math.max(0, end - Math.max(0, avail));
    }
    hasAbove = start > 0;
  }

  const slice = avail > 0 ? vlines.slice(start, end) : [];

  // Assemble all rows and hard-cap to `rows` (keep the bottom ones — newest,
  // closest to the action). This guards the edge case of `rows===1` with content
  // both above and below the window (both indicators = 2 rows): the cap trims to
  // the budget instead of overflowing the frame (on overflow Ink truncates/duplicates).
  const pieces = [];
  if (hasAbove) pieces.push(<Text key="above" dimColor>{tfmt(t.OlderEntries, { count: start })}</Text>);
  if (total === 0) pieces.push(<Text key="empty" dimColor>{t.LogEmpty}</Text>);
  for (const l of slice) pieces.push(
    <Text key={l.key} color={l.color} dimColor={l.dim || dim} wrap={l.trunc ? 'truncate-end' : 'wrap'}>{l.text}</Text>
  );
  if (hasBelow) pieces.push(<Text key="below" dimColor>{tfmt(t.NewerEntries, { count: total - end })}</Text>);
  const visible = pieces.length > rows ? pieces.slice(pieces.length - rows) : pieces;

  return <Box flexDirection="column" paddingX={1}>{visible}</Box>;
}
