// Minimal LCS-based line diff implementation (no external dependencies).
// Used to preview differences before resolving a conflict.

const MAX_DIFF_BYTES = 256 * 1024;

// Returns an array of { type, line } where type ∈ {'ctx','add','del'}.
// If the combined text size exceeds the threshold — returns { tooLarge: true }.
// Input: two UTF-8 strings; decoding Buffers is the caller's responsibility.
export function lineDiff(aText, bText) {
  const aLen = (aText || '').length;
  const bLen = (bText || '').length;
  if (aLen + bLen > MAX_DIFF_BYTES) return { tooLarge: true };

  // Normalize line endings (CRLF/CR → LF). Comarch template files often have
  // Windows endings (\r\n); without this every line would carry a trailing \r,
  // which in the terminal moves the cursor to the start of the row and breaks rendering.
  const a = (aText || '').split(/\r\n|\r|\n/);
  const b = (bText || '').split(/\r\n|\r|\n/);
  const m = a.length;
  const n = b.length;

  // LCS table — Uint32Array saves memory on large files.
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Reconstruct the path from the end.
  const out = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      out.push({ type: 'ctx', line: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      out.push({ type: 'add', line: b[j - 1] });
      j--;
    } else {
      out.push({ type: 'del', line: a[i - 1] });
      i--;
    }
  }
  return out.reverse();
}

// Convenience wrapper: { added, removed, hunks } or { tooLarge: true }.
export function diffSummary(aText, bText) {
  const diff = lineDiff(aText, bText);
  if (diff.tooLarge) return { tooLarge: true, added: 0, removed: 0, hunks: [] };
  const added = diff.filter((d) => d.type === 'add').length;
  const removed = diff.filter((d) => d.type === 'del').length;
  return { added, removed, hunks: diff };
}

// Builds display rows from a raw line-diff: assigns line numbers (local `aLn` /
// remote `bLn`, 1-based) and COLLAPSES long runs of unchanged lines — showing only
// `context` rows around each change and the rest as a "fold" (one "N unchanged"
// row). This way, in a large file with a single change, you are not drowning in
// hundreds of blank context lines. Returns an array of:
//   { type:'ctx'|'add'|'del', line, aLn, bLn }   (aLn or bLn = null by type)
//   { type:'fold', count }                        (N collapsed context lines)
// The `fold` option (default `true`): when `false`, returns EVERY row with a line
// number and WITHOUT collapsing (expanded mode — the user wants full context).
export function buildDiffRows(diff, { context = 3, fold = true } = {}) {
  if (!Array.isArray(diff)) return [];
  let a = 0;
  let b = 0;
  const items = diff.map((d) => {
    if (d.type === 'add') { b += 1; return { type: 'add', line: d.line, aLn: null, bLn: b }; }
    if (d.type === 'del') { a += 1; return { type: 'del', line: d.line, aLn: a, bLn: null }; }
    a += 1; b += 1; return { type: 'ctx', line: d.line, aLn: a, bLn: b };
  });
  if (!fold) return items; // expanded mode: all rows, no context collapsing

  // mark rows to show: every change + `context` lines on each side
  const keep = new Array(items.length).fill(false);
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'ctx') continue;
    const lo = Math.max(0, i - context);
    const hi = Math.min(items.length - 1, i + context);
    for (let j = lo; j <= hi; j++) keep[j] = true;
  }

  // assemble rows; contiguous gaps of unchanged lines (≥2) → a single fold
  const rows = [];
  let i = 0;
  while (i < items.length) {
    if (keep[i]) { rows.push(items[i]); i += 1; continue; }
    let j = i;
    while (j < items.length && !keep[j]) j += 1;
    const count = j - i;
    if (count >= 2) rows.push({ type: 'fold', count });
    else rows.push(items[i]); // a single line — cheaper to show than to fold
    i = j;
  }
  return rows;
}
