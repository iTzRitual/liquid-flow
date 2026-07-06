import { describe, it, expect } from 'vitest';
import { lineDiff, diffSummary, buildDiffRows } from './diff.js';

describe('lineDiff', () => {
  it('identyczne wejścia → same ctx', () => {
    const r = lineDiff('a\nb', 'a\nb');
    expect(r).toEqual([{ type: 'ctx', line: 'a' }, { type: 'ctx', line: 'b' }]);
  });

  it('czyste dodanie linii', () => {
    const r = lineDiff('a', 'a\nnew');
    expect(r.find((l) => l.type === 'add')?.line).toBe('new');
    expect(r.find((l) => l.type === 'del')).toBeUndefined();
  });

  it('czyste usunięcie linii', () => {
    const r = lineDiff('old\na', 'a');
    expect(r.find((l) => l.type === 'del')?.line).toBe('old');
    expect(r.find((l) => l.type === 'add')).toBeUndefined();
  });

  it('mieszana zmiana (zastąpienie linii)', () => {
    const r = lineDiff('a\nb\nc', 'a\nx\nc');
    expect(r.find((l) => l.type === 'del')?.line).toBe('b');
    expect(r.find((l) => l.type === 'add')?.line).toBe('x');
    const ctx = r.filter((l) => l.type === 'ctx').map((l) => l.line);
    expect(ctx).toContain('a');
    expect(ctx).toContain('c');
  });

  it('pusty string vs treść', () => {
    const r = lineDiff('', 'hello');
    expect(r.some((l) => l.type === 'add' && l.line === 'hello')).toBe(true);
  });

  it('treść vs pusty string', () => {
    const r = lineDiff('hello', '');
    expect(r.some((l) => l.type === 'del' && l.line === 'hello')).toBe(true);
  });

  it('przekroczenie MAX_DIFF_BYTES → tooLarge', () => {
    const big = 'x'.repeat(200 * 1024);
    expect(lineDiff(big, big)).toEqual({ tooLarge: true });
  });

  it('graniczne: oba puste', () => {
    const r = lineDiff('', '');
    expect(Array.isArray(r)).toBe(true);
    expect(r.every((l) => l.type === 'ctx')).toBe(true);
  });

  it('normalizuje końce linii CRLF/CR (bez końcowego \\r w liniach)', () => {
    // Comarch template files sometimes have Windows endings (\r\n) — \r must not
    // leak into the line content (in the terminal it moves the cursor and breaks rendering).
    const crlf = lineDiff('a\r\nb\r\nc', 'a\r\nB\r\nc');
    expect(crlf.every((l) => !l.line.includes('\r'))).toBe(true);
    expect(crlf.find((l) => l.type === 'del')?.line).toBe('b');
    expect(crlf.find((l) => l.type === 'add')?.line).toBe('B');

    // identical content differing ONLY in line endings → no changes
    const sameContent = lineDiff('x\r\ny\r\nz', 'x\ny\nz');
    expect(sameContent.every((l) => l.type === 'ctx')).toBe(true);
  });
});

describe('diffSummary', () => {
  it('liczy dodane i usunięte linie', () => {
    const r = diffSummary('a\nb', 'a\nc');
    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);
    expect(Array.isArray(r.hunks)).toBe(true);
  });

  it('propaguje tooLarge', () => {
    const big = 'x'.repeat(200 * 1024);
    const r = diffSummary(big, big);
    expect(r.tooLarge).toBe(true);
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
  });

  it('identyczne → added=0, removed=0', () => {
    const r = diffSummary('line\nline2', 'line\nline2');
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
  });
});

describe('buildDiffRows', () => {
  it('przypisuje numery linii lokalne/zdalne', () => {
    const diff = [
      { type: 'ctx', line: 'a' },
      { type: 'del', line: 'b' },
      { type: 'add', line: 'B' },
      { type: 'ctx', line: 'c' },
    ];
    const rows = buildDiffRows(diff, { context: 3 });
    expect(rows).toEqual([
      { type: 'ctx', line: 'a', aLn: 1, bLn: 1 },
      { type: 'del', line: 'b', aLn: 2, bLn: null },
      { type: 'add', line: 'B', aLn: null, bLn: 2 },
      { type: 'ctx', line: 'c', aLn: 3, bLn: 3 },
    ]);
  });

  it('zwija długie ciągi niezmienionych linii poza kontekstem w fold', () => {
    // 1 change at the start, then 10 context lines → the tail is folded
    const diff = [{ type: 'add', line: 'new' }];
    for (let i = 0; i < 10; i++) diff.push({ type: 'ctx', line: `c${i}` });
    const rows = buildDiffRows(diff, { context: 3 });
    // add + 3 context lines + 1 fold (the remaining 7)
    expect(rows.filter((r) => r.type === 'add')).toHaveLength(1);
    expect(rows.filter((r) => r.type === 'ctx')).toHaveLength(3);
    const fold = rows.find((r) => r.type === 'fold');
    expect(fold).toBeTruthy();
    expect(fold.count).toBe(7);
  });

  it('brak zmian → jeden fold z całą liczbą linii', () => {
    const diff = Array.from({ length: 5 }, (_, i) => ({ type: 'ctx', line: `c${i}` }));
    const rows = buildDiffRows(diff, { context: 3 });
    expect(rows).toEqual([{ type: 'fold', count: 5 }]);
  });

  it('same zmiany → wszystkie wiersze zachowane (bez fold)', () => {
    const diff = [
      { type: 'del', line: 'x' },
      { type: 'add', line: 'y' },
    ];
    const rows = buildDiffRows(diff, { context: 3 });
    expect(rows.some((r) => r.type === 'fold')).toBe(false);
    expect(rows).toHaveLength(2);
  });

  it('pojedyncza luka (1 linia) nie jest zwijana', () => {
    // two changes exactly 1 context line apart, outside the reach of context=0
    const diff = [
      { type: 'add', line: 'a' },
      { type: 'ctx', line: 'gap' },
      { type: 'add', line: 'b' },
    ];
    const rows = buildDiffRows(diff, { context: 0 });
    expect(rows.some((r) => r.type === 'fold')).toBe(false);
    expect(rows.find((r) => r.type === 'ctx')?.line).toBe('gap');
  });

  it('puste/niepoprawne wejście → []', () => {
    expect(buildDiffRows(null)).toEqual([]);
    expect(buildDiffRows(undefined)).toEqual([]);
    expect(buildDiffRows([])).toEqual([]);
  });

  it('fold:false → wszystkie wiersze z numerami, bez zwijania', () => {
    // a change + a long context tail that would fold under the default fold mode
    const diff = [{ type: 'add', line: 'new' }];
    for (let i = 0; i < 5; i++) diff.push({ type: 'ctx', line: `c${i}` });
    const rows = buildDiffRows(diff, { fold: false });
    expect(rows.filter((r) => r.type === 'fold')).toHaveLength(0);
    expect(rows).toHaveLength(diff.length); // one row per input line
    // line numbers are still assigned
    expect(rows[0]).toEqual({ type: 'add', line: 'new', aLn: null, bLn: 1 });
    expect(rows.at(-1)).toEqual({ type: 'ctx', line: 'c4', aLn: 5, bLn: 6 });
  });
});
