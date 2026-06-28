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

// Buduje wiersze do wyświetlenia z surowego line-diff: przypisuje numery linii
// (lokalna `aLn` / zdalna `bLn`, 1-based) i ZWIJA długie ciągi niezmienionych
// linii — pokazujemy tylko `context` wierszy wokół każdej zmiany, resztę jako
// „fold" (jeden wiersz „N niezmienionych"). Dzięki temu w wielkim pliku z jedną
// zmianą nie toniesz w setkach białych linii kontekstu. Zwraca tablicę:
//   { type:'ctx'|'add'|'del', line, aLn, bLn }   (aLn lub bLn = null wg typu)
//   { type:'fold', count }                        (N zwiniętych linii kontekstu)
export function buildDiffRows(diff, { context = 3 } = {}) {
  if (!Array.isArray(diff)) return [];
  let a = 0;
  let b = 0;
  const items = diff.map((d) => {
    if (d.type === 'add') { b += 1; return { type: 'add', line: d.line, aLn: null, bLn: b }; }
    if (d.type === 'del') { a += 1; return { type: 'del', line: d.line, aLn: a, bLn: null }; }
    a += 1; b += 1; return { type: 'ctx', line: d.line, aLn: a, bLn: b };
  });

  // zaznacz wiersze do pokazania: każda zmiana + `context` linii w obie strony
  const keep = new Array(items.length).fill(false);
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'ctx') continue;
    const lo = Math.max(0, i - context);
    const hi = Math.min(items.length - 1, i + context);
    for (let j = lo; j <= hi; j++) keep[j] = true;
  }

  // złóż wiersze; ciągłe luki niezmienionych linii (≥2) → jeden fold
  const rows = [];
  let i = 0;
  while (i < items.length) {
    if (keep[i]) { rows.push(items[i]); i += 1; continue; }
    let j = i;
    while (j < items.length && !keep[j]) j += 1;
    const count = j - i;
    if (count >= 2) rows.push({ type: 'fold', count });
    else rows.push(items[i]); // pojedyncza linia — taniej pokazać niż zwijać
    i = j;
  }
  return rows;
}
