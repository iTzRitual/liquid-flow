// Minimalna implementacja LCS-based line diff (bez zewnętrznych zależności).
// Używana do podglądu różnic przed rozwiązaniem konfliktu.

const MAX_DIFF_BYTES = 256 * 1024;

// Zwraca tablicę { type, line } gdzie type ∈ {'ctx','add','del'}.
// Jeśli łączny rozmiar tekstu przekracza próg — zwraca { tooLarge: true }.
// Wejście: dwa stringi UTF-8; dekodowanie Bufferów po stronie wywołującego.
export function lineDiff(aText, bText) {
  const aLen = (aText || '').length;
  const bLen = (bText || '').length;
  if (aLen + bLen > MAX_DIFF_BYTES) return { tooLarge: true };

  const a = (aText || '').split('\n');
  const b = (bText || '').split('\n');
  const m = a.length;
  const n = b.length;

  // Tablica LCS — Uint32Array oszczędza pamięć przy dużych plikach.
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Odtworzenie ścieżki od końca.
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

// Wygodny wrapper: { added, removed, hunks } lub { tooLarge: true }.
export function diffSummary(aText, bText) {
  const diff = lineDiff(aText, bText);
  if (diff.tooLarge) return { tooLarge: true, added: 0, removed: 0, hunks: [] };
  const added = diff.filter((d) => d.type === 'add').length;
  const removed = diff.filter((d) => d.type === 'del').length;
  return { added, removed, hunks: diff };
}
