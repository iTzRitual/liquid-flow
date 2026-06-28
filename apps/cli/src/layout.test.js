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

  it('pref=compact wymusza zwinięty nagłówek nawet w wysokim oknie', () => {
    const hl = headerLayout({ termRows: 30, termCols: COLS, mode: { type: 'input' }, pref: 'compact' });
    expect(hl.mode).toBe('compact');
    expect(hl.height).toBe(COMPACT_HEADER_ROWS);
  });

  it('pref=compact nadal degraduje do none/guard przy za niskim oknie', () => {
    const mode = { type: 'conflicts', files: [1, 2], bulk: [1] }; // natural = 13
    // compact (under(2)=12 < 13) nie mieści całej treści → ukryty
    expect(headerLayout({ termRows: 14, termCols: COLS, mode, pref: 'compact' }).mode).toBe('none');
    // poniżej globalnej podłogi → guard niezależnie od pref
    expect(headerLayout({ termRows: 7, termCols: COLS, mode, pref: 'compact' }).mode).toBe('guard');
  });

  it('conflicts: nagłówek degraduje, by zmieścić WSZYSTKIE karty (nie okienkować)', () => {
    const mode = { type: 'conflicts', files: [1, 2], bulk: [1] }; // natural = 2*4+1+4 = 13
    // root = termRows, więc under(h) = termRows − h. Pełny nagłówek (8) mieści całą
    // treść dopiero gdy under(8) ≥ 13 → termRows ≥ 21
    expect(headerLayout({ termRows: 21, termCols: COLS, mode }).mode).toBe('full');
    // 20: pełny by okienkował karty (under(8)=12 < 13) → schodzi do compact (under(2)=18 ≥ 13)
    expect(headerLayout({ termRows: 20, termCols: COLS, mode }).mode).toBe('compact');
    expect(headerLayout({ termRows: 16, termCols: COLS, mode }).mode).toBe('compact');
    // 14: nawet compact by okienkował (under(2)=12 < 13) → nagłówek ukryty (under(0)=14 ≥ 13)
    expect(headerLayout({ termRows: 14, termCols: COLS, mode }).mode).toBe('none');
  });

  it('picker z wieloma pozycjami woli mniejszy nagłówek niż okienkowanie listy', () => {
    // 10 pozycji → natural = 14. Przy 20 wierszach pełny nagłówek (8) zostawia tylko
    // under(8)=12 < 14 → musiałby okienkować listę. Wolimy compact (under(2)=18 ≥ 14),
    // żeby pokazać wszystkie pozycje — to jest sedno zgłoszenia.
    const many = { type: 'picker', items: Array.from({ length: 10 }) };
    expect(headerLayout({ termRows: 20, termCols: COLS, mode: many }).mode).toBe('compact');
    // mało pozycji przy tej samej wysokości → pełny nagłówek (treść i tak się mieści)
    const few = { type: 'picker', items: [1, 2] }; // natural = 6
    expect(headerLayout({ termRows: 20, termCols: COLS, mode: few }).mode).toBe('full');
  });

  it('bardzo niskie okno (conflicts) → ukryty nagłówek, potem guard', () => {
    const mode = { type: 'conflicts', files: [1], bulk: [] }; // natural = 1*4 + 0 + 4 = 8
    // 10: compact under(2)=8 ≥ 8 → compact (cała karta + nagłówek compact)
    expect(headerLayout({ termRows: 10, termCols: COLS, mode }).mode).toBe('compact');
    // 9: compact under(2)=7 < 8 → none (under(0)=9 ≥ 8 mieści całą kartę)
    expect(headerLayout({ termRows: 9, termCols: COLS, mode }).mode).toBe('none');
    // rows=8 = globalna podłoga (appMinRows) → jeszcze NIE guard, nagłówek ukryty
    expect(headerLayout({ termRows: 8, termCols: COLS, mode }).mode).toBe('none');
    // rows=7 < podłoga → guard
    expect(headerLayout({ termRows: 7, termCols: COLS, mode }).mode).toBe('guard');
  });

  it('naturalBodyRows = pełna wysokość treści (spójne z App.overlayNatural)', () => {
    expect(naturalBodyRows({ type: 'picker', items: [1, 2, 3] })).toBe(7); // 3 + 4
    expect(naturalBodyRows({ type: 'connect', shops: [1, 2] })).toBe(8); // 2 + 6
    expect(naturalBodyRows({ type: 'conflicts', files: [1, 2], bulk: [1] })).toBe(13);
    expect(naturalBodyRows({ type: 'form', fields: [1, 2] })).toBe(6); // 2 + 4
    expect(naturalBodyRows({ type: 'loading' })).toBe(4);
    // input/loader: log przewija się / stała treść → natural = minimum (bez degradacji)
    expect(naturalBodyRows({ type: 'input' })).toBe(minBodyRows({ type: 'input' }));
  });

  it('minBodyRows uwzględnia stopkę seryjną tylko gdy są operacje bulk', () => {
    expect(minBodyRows({ type: 'conflicts', files: [1], bulk: [] })).toBe(7);
    expect(minBodyRows({ type: 'conflicts', files: [1], bulk: [1] })).toBe(8);
    expect(minBodyRows({ type: 'picker' })).toBe(5);
    expect(minBodyRows({ type: 'input' })).toBe(2);
  });

  it('guard to globalna podłoga — ten sam próg i minRows dla KAŻDEGO trybu', () => {
    const floor = appMinRows();
    expect(floor).toBe(8); // conflicts z bulk (8); root = termRows, brak „+1"
    const modes = [
      { type: 'input' },
      { type: 'picker', items: [1] },
      { type: 'conflicts', files: [1], bulk: [1] },
      { type: 'form', fields: [1] },
      { type: 'loading' },
      { type: 'connect', shops: [1] },
    ];
    for (const mode of modes) {
      // Tuż poniżej podłogi: guard niezależnie od trybu (nie wyskoczy w środku pracy).
      const below = headerLayout({ termRows: floor - 1, termCols: COLS, mode });
      expect(below.mode, `guard dla ${mode.type} przy ${floor - 1}`).toBe('guard');
      expect(below.minRows).toBe(floor);
      // Na podłodze: już nie guard (każdy tryb się mieści, choćby z ukrytym nagłówkiem).
      const at = headerLayout({ termRows: floor, termCols: COLS, mode });
      expect(at.mode, `nie‑guard dla ${mode.type} przy ${floor}`).not.toBe('guard');
      expect(at.minRows).toBe(floor); // komunikat zawsze pokazuje globalne minimum
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
