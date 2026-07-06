// Computes a "window" of the list's visible items so the selected element (index)
// is always visible and the total does not exceed `max` rows. When there are more
// items than fit on screen, it reserves rows for the ↑/↓ more indicators.
// Returns { start, count, above, below }.
export function windowList(n, index, max) {
  const cap = Math.max(3, max);
  if (n <= cap) return { start: 0, count: n, above: 0, below: 0 };

  // two passes: first assume both indicators, then correct at the edges
  let slots = cap - 2;
  let start = Math.max(0, Math.min(index - Math.floor(slots / 2), n - slots));
  let top = start > 0;
  let bottom = start + slots < n;

  slots = cap - (top ? 1 : 0) - (bottom ? 1 : 0);
  start = Math.max(0, Math.min(index - Math.floor(slots / 2), n - slots));
  let above = start;
  let below = n - (start + slots);

  // A "1 more" indicator takes exactly as many rows as the item itself — instead
  // of showing "↑ 1 more" / "↓ 1 more", extend the window by that item.
  // The total row count (window + indicators) does not grow.
  if (above === 1) { start -= 1; slots += 1; above = 0; }
  if (below === 1) { slots += 1; below = 0; }

  return { start, count: slots, above, below };
}

// Windows items of a FIXED height `itemLines` (e.g. conflict cards = 3 rows) so
// they fit within `budgetLines`, with the selected (index) always visible. When
// they do not all fit, it reserves one row each for the ↑/↓ indicators
// (top/bottom as needed). Returns { start, count, above, below }.
export function windowCards(n, index, budgetLines, itemLines) {
  if (n <= 0) return { start: 0, count: 0, above: 0, below: 0 };
  if (n * itemLines <= budgetLines) return { start: 0, count: n, above: 0, below: 0 };

  // first approximation with both indicators, then correction at the edges
  let cap = Math.max(1, Math.floor((budgetLines - 2) / itemLines));
  let start = Math.max(0, Math.min(index - Math.floor(cap / 2), n - cap));
  let top = start > 0;
  let bottom = start + cap < n;

  // missing one indicator → the recovered row may afford one more card
  cap = Math.max(1, Math.floor((budgetLines - (top ? 1 : 0) - (bottom ? 1 : 0)) / itemLines));
  start = Math.max(0, Math.min(index - Math.floor(cap / 2), n - cap));
  const above = start;
  const below = n - (start + cap);
  return { start, count: cap, above, below };
}
