import { describe, it, expect } from 'vitest';
import { lineDiff, diffSummary } from './diff.js';

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
