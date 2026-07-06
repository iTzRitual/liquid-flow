// Pure height-layout logic — header degradation on a low window.
//
// Rule: the header gives way to content as the window gets low. We step down the
// tiers: full (logo) → compact (1 row) → hidden (the modal "takes over" the header,
// like position:absolute on the web — the terminal has no z-index, so we simply do
// not render it). When even without the header the mode's minimum does not fit — we
// return `guard` (the "window too small" screen).
import { HEADER_STACK_COLS } from './components/Header.jsx';

// Actual header heights (including the top divider below it):
//  - full 2-column: marginTop(1)+logo(6)+divider(1) = 8,
//  - full vertical (narrow window): logo+info stacked = 14,
//  - compact: 1 header row + divider = 2.
export const FULL_HEADER_ROWS = 8;
export const FULL_HEADER_STACKED_ROWS = 14;
export const COMPACT_HEADER_ROWS = 2;

// Threshold above which we allow a full header at all (consistent with the former fillHeight).
export const FULL_HEADER_MIN_TERM_ROWS = 16;

// How many content rows BELOW the header a given mode needs to be usable.
// (overlay chrome = frame 2 + title 1 + help/footer 1 = 4)
// This is the MINIMUM (1 item / 1 card) — used for the global floor and the guard,
// NOT for choosing the header variant (that is driven by `naturalBodyRows`).
export function minBodyRows(mode) {
  switch (mode?.type) {
    case 'conflicts': return 4 + 3 + (mode.bulk?.length ? 1 : 0); // chrome + 1 card (3) + footer
    case 'picker':
    case 'connect':
    case 'form':
    case 'diff': return 5; // chrome + 1 item/line
    case 'loading': return 4; // frame + title + spinner
    case 'info': return 4; // frame + title + message + countdown
    default: return 2; // input: minimally log/divider + field
  }
}

// How many content rows a mode wants to show IN FULL (the whole list / all cards,
// without windowing) — the "natural" overlay height. This drives header degradation:
// we prefer to shrink/hide the header rather than window the items (see
// `headerLayout`). It MUST be consistent with `overlayNatural` in App.jsx — the same
// number decides when the overlay starts windowing, so the chrome figures (+4/+6,
// card = 4 rows) must match. For `input`/`loading` natural = minimum: the log is a
// scrollable filler and the loader has fixed, small content — they do not force
// header degradation.
export function naturalBodyRows(mode) {
  switch (mode?.type) {
    case 'picker': return (mode.items?.length || 0) + 4;
    case 'connect': return (mode.shops?.length || 0) + 6;
    case 'conflicts': return (mode.files?.length || 0) * 4 + (mode.bulk?.length ? 1 : 0) + 4;
    case 'form': return (mode.fields?.length || 0) + 4;
    // diff preview: collapsed → `lines`, expanded (Tab) → `fullLines`. The overlay
    // grows once expanded, so Tab enlarges the window (rather than squeezing content into 1 row).
    case 'diff': return (mode.expanded ? (mode.fullLines ?? mode.lines ?? 0) : (mode.lines || 0)) + 4;
    // frame (2) + optional title (1) + message (1) + countdown (1)
    case 'info': return 2 + (mode.title ? 1 : 0) + 2;
    default: return minBodyRows(mode); // loading/input
  }
}

// All modes that can appear during work — for computing the global floor (the
// heaviest screen). `conflicts` with bulk operations is the highest requirement.
// We take the worst case of each mode.
const ALL_MODES = [
  { type: 'conflicts', bulk: [0] },
  { type: 'picker' },
  { type: 'connect' },
  { type: 'form' },
  { type: 'loading' },
  { type: 'input' },
];

// Global minimum window height for the WHOLE application: as much as the heaviest
// screen needs (root = termRows, so no "+1"). This way the "window too small"
// message appears immediately (on every screen), not only after entering a heavier
// screen mid-work — the minimum is consistent across all modes.
export function appMinRows() {
  return Math.max(...ALL_MODES.map(minBodyRows));
}

// Choose the header variant by window height and the current mode.
// Returns { mode: 'full'|'compact'|'none'|'guard', height, minRows }.
// `height` is the number of rows the header occupies (with the top divider);
// `minRows` is the GLOBAL application minimum (for the guard message, consistent everywhere).
//
// Selection rule: we take the LARGEST header variant at which the mode's ENTIRE
// content (`naturalBodyRows`) still fits BELOW the header — without windowing. When
// there is a lot of content (e.g. many files in /conflicts or a long list), a full
// header would window it (fewer visible items), so we drop to compact and then hide
// the header (none) — the content gets the whole height instead of losing items.
// When even without the header the content does not fit, we still use `none` (max
// space; the overlay then windows itself). Light modes (input — the log scrolls;
// loader) have `naturalBodyRows = minimum`, so they keep the full header when the
// window allows.
//
// Guard uses the global floor (`appMinRows`, computed from `minBodyRows`), NOT the
// natural height — otherwise the "window too small" notice would pop up on every
// longer list. Above the floor `under(0) >= minBodyRows` holds for every mode, so
// 'none' always fits at least the current mode's minimum.
// `pref` — the user's preference from settings: 'auto' (default, degradation as
// above) or 'compact' (the header is ALWAYS collapsed to 1 row when it fits — never
// the full logo). Regardless of `pref` we drop to 'none'/'guard' when the window is
// too low even for compact.
export function headerLayout({ termRows, termCols, mode, pref = 'auto' }) {
  const minRows = appMinRows();
  if (termRows < minRows) return { mode: 'guard', height: 0, minRows };

  const want = naturalBodyRows(mode);
  const fullH = termCols < HEADER_STACK_COLS ? FULL_HEADER_STACKED_ROWS : FULL_HEADER_ROWS;
  const under = (h) => termRows - h; // root grows to full height (termRows)
  if (pref !== 'compact' && termRows >= FULL_HEADER_MIN_TERM_ROWS && under(fullH) >= want)
    return { mode: 'full', height: fullH, minRows };
  if (under(COMPACT_HEADER_ROWS) >= want)
    return { mode: 'compact', height: COMPACT_HEADER_ROWS, minRows };
  return { mode: 'none', height: 0, minRows };
}
