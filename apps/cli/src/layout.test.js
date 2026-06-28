import { describe, it, expect } from 'vitest';
import {
  headerLayout,
  minBodyRows,
  FULL_HEADER_ROWS,
  COMPACT_HEADER_ROWS,
  FULL_HEADER_MIN_TERM_ROWS,
} from './layout.js';

const COLS = 80; // szerokie okno → pełny nagłówek nie jest stackowany

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

  it('conflicts: pełny nagłówek tylko gdy realnie się mieści', () => {
    const mode = { type: 'conflicts', files: [1, 2], bulk: [1] }; // need = 8
    // przy 16 wierszach: under(full=8) = 16-1-8 = 7 < 8 → NIE pełny, ma być compact
    const hl16 = headerLayout({ termRows: 16, termCols: COLS, mode });
    expect(hl16.mode).toBe('compact');
    // przy 18: under(8) = 9 ≥ 8 → pełny
    expect(headerLayout({ termRows: 18, termCols: COLS, mode }).mode).toBe('full');
  });

  it('bardzo niskie okno (conflicts) → ukryty nagłówek, potem guard', () => {
    const mode = { type: 'conflicts', files: [1], bulk: [] }; // need = 4 + 3 = 7 → minRows 8
    // under(compact=2) = rows-1-2; potrzeba ≥7 → rows ≥10 dla compact
    expect(headerLayout({ termRows: 10, termCols: COLS, mode }).mode).toBe('compact');
    // rows=8: under(2)=5<7, under(0)=7≥7 → ukryty
    expect(headerLayout({ termRows: 8, termCols: COLS, mode }).mode).toBe('none');
    // rows=7: under(0)=6<7 → guard
    const guard = headerLayout({ termRows: 7, termCols: COLS, mode });
    expect(guard.mode).toBe('guard');
    expect(guard.minRows).toBe(8);
  });

  it('minBodyRows uwzględnia stopkę seryjną tylko gdy są operacje bulk', () => {
    expect(minBodyRows({ type: 'conflicts', files: [1], bulk: [] })).toBe(7);
    expect(minBodyRows({ type: 'conflicts', files: [1], bulk: [1] })).toBe(8);
    expect(minBodyRows({ type: 'picker' })).toBe(5);
    expect(minBodyRows({ type: 'input' })).toBe(2);
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
        const under = rows - 1 - hl.height;
        expect(under, `tryb ${mode.type} przy ${rows} wierszach`).toBeGreaterThanOrEqual(minBodyRows(mode));
      }
    }
  });
});
