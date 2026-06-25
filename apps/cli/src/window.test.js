import { describe, it, expect } from 'vitest';
import { windowList, windowCards } from './window.js';

describe('windowList', () => {
  it('mieści wszystko bez wskaźników gdy n <= max', () => {
    expect(windowList(3, 0, 10)).toEqual({ start: 0, count: 3, above: 0, below: 0 });
  });

  it('zaznaczony element zawsze w oknie (środek)', () => {
    const w = windowList(100, 50, 10);
    expect(50).toBeGreaterThanOrEqual(w.start);
    expect(50).toBeLessThan(w.start + w.count);
    expect(w.above).toBeGreaterThan(0);
    expect(w.below).toBeGreaterThan(0);
  });

  it('na górze listy nie ma wskaźnika „above”', () => {
    const w = windowList(100, 0, 10);
    expect(w.start).toBe(0);
    expect(w.above).toBe(0);
    expect(w.below).toBe(100 - w.count);
  });

  it('na dole listy nie ma wskaźnika „below”', () => {
    const w = windowList(100, 99, 10);
    expect(w.below).toBe(0);
    expect(w.start + w.count).toBe(100);
  });

  it('okno + wskaźniki nigdy nie przekracza budżetu max', () => {
    for (const idx of [0, 1, 25, 50, 98, 99]) {
      const w = windowList(100, idx, 10);
      const indicators = (w.above > 0 ? 1 : 0) + (w.below > 0 ? 1 : 0);
      expect(w.count + indicators).toBeLessThanOrEqual(10);
    }
  });
});

describe('windowCards (karty o stałej wysokości)', () => {
  it('n=0 → puste okno', () => {
    expect(windowCards(0, 0, 30, 3)).toEqual({ start: 0, count: 0, above: 0, below: 0 });
  });

  it('mieści wszystkie karty gdy starcza miejsca', () => {
    // 3 karty * 3 wiersze = 9 <= 30
    expect(windowCards(3, 0, 30, 3)).toEqual({ start: 0, count: 3, above: 0, below: 0 });
  });

  it('okienkuje gdy karty się nie mieszczą, zaznaczona widoczna', () => {
    const w = windowCards(20, 10, 12, 3); // budżet 12 wierszy, karta 3 → ~3-4 karty
    expect(10).toBeGreaterThanOrEqual(w.start);
    expect(10).toBeLessThan(w.start + w.count);
    expect(w.count * 3).toBeLessThanOrEqual(12);
  });

  it('na dole nie ma „below”', () => {
    const w = windowCards(20, 19, 12, 3);
    expect(w.below).toBe(0);
    expect(w.start + w.count).toBe(20);
  });
});
