import { describe, it, expect } from 'vitest';
import {
  headerLayout,
  minBodyRows,
  naturalBodyRows,
  appMinRows,
  FULL_HEADER_ROWS,
  COMPACT_HEADER_ROWS,
  FULL_HEADER_MIN_TERM_ROWS,
} from './layout.js';

const COLS = 80; // a wide window → the full header is not stacked

describe('headerLayout — degradacja nagłówka z wysokością', () => {
  it('wysokie okno (input) → pełny nagłówek', () => {
    const hl = headerLayout({ termRows: 30, termCols: COLS, mode: { type: 'input' } });
    expect(hl.mode).toBe('full');
    expect(hl.height).toBe(FULL_HEADER_ROWS);
  });

  it('poniżej progu pełnego nagłówka (input) → compact', () => {
    const hl = headerLayout({ termRows: FULL_HEADER_MIN_TERM_ROWS - 1, termCols: COLS, mode: { type: 'input' } });
    expect(hl.mode).toBe('compact');
    expect(hl.height).toBe(COMPACT_HEADER_ROWS);
  });

  it('pref=compact wymusza zwinięty nagłówek nawet w wysokim oknie', () => {
    const hl = headerLayout({ termRows: 30, termCols: COLS, mode: { type: 'input' }, pref: 'compact' });
    expect(hl.mode).toBe('compact');
    expect(hl.height).toBe(COMPACT_HEADER_ROWS);
  });

  it('pref=compact nadal degraduje do none/guard przy za niskim oknie', () => {
    const mode = { type: 'conflicts', files: [1, 2], bulk: [1] }; // natural = 13
    // compact (under(2)=12 < 13) does not fit all the content → hidden
    expect(headerLayout({ termRows: 14, termCols: COLS, mode, pref: 'compact' }).mode).toBe('none');
    // below the global floor → guard regardless of pref
    expect(headerLayout({ termRows: 7, termCols: COLS, mode, pref: 'compact' }).mode).toBe('guard');
  });

  it('conflicts: nagłówek degraduje, by zmieścić WSZYSTKIE karty (nie okienkować)', () => {
    const mode = { type: 'conflicts', files: [1, 2], bulk: [1] }; // natural = 2*4+1+4 = 13
    // root = termRows, so under(h) = termRows − h. The full header (8) only fits
    // all the content when under(8) ≥ 13 → termRows ≥ 21
    expect(headerLayout({ termRows: 21, termCols: COLS, mode }).mode).toBe('full');
    // 20: full would window the cards (under(8)=12 < 13) → drops to compact (under(2)=18 ≥ 13)
    expect(headerLayout({ termRows: 20, termCols: COLS, mode }).mode).toBe('compact');
    expect(headerLayout({ termRows: 16, termCols: COLS, mode }).mode).toBe('compact');
    // 14: even compact would window (under(2)=12 < 13) → header hidden (under(0)=14 ≥ 13)
    expect(headerLayout({ termRows: 14, termCols: COLS, mode }).mode).toBe('none');
  });

  it('picker z wieloma pozycjami woli mniejszy nagłówek niż okienkowanie listy', () => {
    // 10 items → natural = 14. At 20 rows the full header (8) leaves only
    // under(8)=12 < 14 → it would have to window the list. We prefer compact
    // (under(2)=18 ≥ 14), to show all the items — that is the crux of the issue.
    const many = { type: 'picker', items: Array.from({ length: 10 }) };
    expect(headerLayout({ termRows: 20, termCols: COLS, mode: many }).mode).toBe('compact');
    // few items at the same height → a full header (the content fits anyway)
    const few = { type: 'picker', items: [1, 2] }; // natural = 6
    expect(headerLayout({ termRows: 20, termCols: COLS, mode: few }).mode).toBe('full');
  });

  it('bardzo niskie okno (conflicts) → ukryty nagłówek, potem guard', () => {
    const mode = { type: 'conflicts', files: [1], bulk: [] }; // natural = 1*4 + 0 + 4 = 8
    // 10: compact under(2)=8 ≥ 8 → compact (the whole card + a compact header)
    expect(headerLayout({ termRows: 10, termCols: COLS, mode }).mode).toBe('compact');
    // 9: compact under(2)=7 < 8 → none (under(0)=9 ≥ 8 fits the whole card)
    expect(headerLayout({ termRows: 9, termCols: COLS, mode }).mode).toBe('none');
    // rows=8 = the global floor (appMinRows) → NOT guard yet, header hidden
    expect(headerLayout({ termRows: 8, termCols: COLS, mode }).mode).toBe('none');
    // rows=7 < floor → guard
    expect(headerLayout({ termRows: 7, termCols: COLS, mode }).mode).toBe('guard');
  });

  it('naturalBodyRows = pełna wysokość treści (spójne z App.overlayNatural)', () => {
    expect(naturalBodyRows({ type: 'picker', items: [1, 2, 3] })).toBe(7); // 3 + 4
    expect(naturalBodyRows({ type: 'connect', shops: [1, 2] })).toBe(8); // 2 + 6
    expect(naturalBodyRows({ type: 'conflicts', files: [1, 2], bulk: [1] })).toBe(13);
    expect(naturalBodyRows({ type: 'form', fields: [1, 2] })).toBe(6); // 2 + 4
    expect(naturalBodyRows({ type: 'loading' })).toBe(4);
    // input/loader: the log scrolls / fixed content → natural = minimum (no degradation)
    expect(naturalBodyRows({ type: 'input' })).toBe(minBodyRows({ type: 'input' }));
  });

  it('diff: rozwinięcie (Tab) rośnie z `lines` do `fullLines` (okno się powiększa)', () => {
    const collapsed = { type: 'diff', lines: 1, fullLines: 163, expanded: false };
    const expanded = { type: 'diff', lines: 1, fullLines: 163, expanded: true };
    expect(naturalBodyRows(collapsed)).toBe(5);   // 1 + 4 (collapsed: a small box)
    expect(naturalBodyRows(expanded)).toBe(167);  // 163 + 4 (expanded: full content)
    // fallback when fullLines is missing → uses lines
    expect(naturalBodyRows({ type: 'diff', lines: 6, expanded: true })).toBe(10);
  });

  it('minBodyRows uwzględnia stopkę seryjną tylko gdy są operacje bulk', () => {
    expect(minBodyRows({ type: 'conflicts', files: [1], bulk: [] })).toBe(7);
    expect(minBodyRows({ type: 'conflicts', files: [1], bulk: [1] })).toBe(8);
    expect(minBodyRows({ type: 'picker' })).toBe(5);
    expect(minBodyRows({ type: 'input' })).toBe(2);
  });

  it('guard to globalna podłoga — ten sam próg i minRows dla KAŻDEGO trybu', () => {
    const floor = appMinRows();
    expect(floor).toBe(8); // conflicts with bulk (8); root = termRows, no "+1"
    const modes = [
      { type: 'input' },
      { type: 'picker', items: [1] },
      { type: 'conflicts', files: [1], bulk: [1] },
      { type: 'form', fields: [1] },
      { type: 'loading' },
      { type: 'connect', shops: [1] },
    ];
    for (const mode of modes) {
      // Just below the floor: guard regardless of mode (it will not pop up mid-work).
      const below = headerLayout({ termRows: floor - 1, termCols: COLS, mode });
      expect(below.mode, `guard for ${mode.type} at ${floor - 1}`).toBe('guard');
      expect(below.minRows).toBe(floor);
      // At the floor: no longer guard (every mode fits, even with a hidden header).
      const at = headerLayout({ termRows: floor, termCols: COLS, mode });
      expect(at.mode, `non-guard for ${mode.type} at ${floor}`).not.toBe('guard');
      expect(at.minRows).toBe(floor); // the message always shows the global minimum
    }
  });

  it('wybrany wariant nigdy nie powoduje przepełnienia (suma ≤ termRows)', () => {
    const modes = [
      { type: 'input' },
      { type: 'picker', items: [1, 2, 3] },
      { type: 'conflicts', files: [1, 2], bulk: [1] },
      { type: 'form', fields: [1] },
      { type: 'loading' },
    ];
    for (const mode of modes) {
      for (let rows = 3; rows <= 40; rows++) {
        const hl = headerLayout({ termRows: rows, termCols: COLS, mode });
        if (hl.mode === 'guard') continue;
        const under = rows - hl.height; // root = termRows
        expect(under, `tryb ${mode.type} przy ${rows} wierszach`).toBeGreaterThanOrEqual(minBodyRows(mode));
      }
    }
  });
});
