import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import LogPane, { buildVlines } from './LogPane.jsx';
import { strip } from '../../../../test/helpers/ink.js';

const t = translationsFor('pl');
const now = Date.now();

const sampleLog = (n) =>
  Array.from({ length: n }, (_, i) => ({ Id: i + 1, TS: now, Color: '#2A2', Text: `Zdarzenie ${i + 1}` }));

describe('buildVlines', () => {
  it('wrap=false → jeden wiersz na wpis (obcinany)', () => {
    const v = buildVlines(sampleLog(5), false, 80);
    expect(v).toHaveLength(5);
    expect(v.every((l) => l.trunc)).toBe(true);
  });

  it('wrap=true → długi wpis rozbity na wiele wierszy', () => {
    const longLog = [{ Id: 1, TS: now, Color: '#2A2', Text: 'x'.repeat(200) }];
    const v = buildVlines(longLog, true, 46);
    expect(v.length).toBeGreaterThan(1);
    // row width = cols-2 (paddingX) — no row exceeds it
    expect(v.every((l) => [...l.text].length <= 44)).toBe(true);
  });

  it('separator → linia pełnej szerokości w kolorze akcentu', () => {
    const log = [{ Id: 1, TS: now, Color: '#82bbff', Text: 'Nowa sesja', kind: 'separator' }];
    const [l] = buildVlines(log, false, 50);
    expect(l.color).toBe('#82bbff');
    expect([...l.text].length).toBe(48); // cols-2
    expect(l.text).toContain('Nowa sesja');
  });
});

function frameLines(api) {
  return strip(api.lastFrame()).replace(/\n+$/g, '').split('\n');
}

describe('LogPane — budżet wierszy i przewijanie', () => {
  const ROWS = 8;

  it('nigdy nie przekracza budżetu rows (z miejscem na wskaźniki)', () => {
    const vlines = buildVlines(sampleLog(20), false, 80);
    for (const scroll of [0, 3, 8, 13]) {
      const api = render(<LogPane vlines={vlines} rows={ROWS} scroll={scroll} t={t} />);
      expect(frameLines(api).length).toBeLessThanOrEqual(ROWS);
    }
  });

  it('twardy budżet także dla małych rows (1,2,3) — wskaźnik nie wypycha wpisu poza okno', () => {
    const vlines = buildVlines(sampleLog(20), false, 80);
    for (const rows of [1, 2, 3]) {
      for (const scroll of [0, 5, 19]) {
        const api = render(<LogPane vlines={vlines} rows={rows} scroll={scroll} t={t} />);
        expect(frameLines(api).length, `rows=${rows} scroll=${scroll}`).toBeLessThanOrEqual(rows);
      }
    }
  });

  it('rows=1 z treścią nad oknem nie pokazuje LogEmpty (log nie jest pusty)', () => {
    const vlines = buildVlines(sampleLog(20), false, 80);
    const api = render(<LogPane vlines={vlines} rows={1} scroll={0} t={t} />);
    expect(strip(api.lastFrame())).not.toContain(t.LogEmpty);
  });

  it('scroll=0 pokazuje najnowszy wpis na dole', () => {
    const vlines = buildVlines(sampleLog(20), false, 80);
    const api = render(<LogPane vlines={vlines} rows={ROWS} scroll={0} t={t} />);
    const lines = frameLines(api);
    expect(lines.at(-1)).toContain('Zdarzenie 20');
  });

  it('maxScroll (= vlines - rows + 1) odsłania najstarszy wpis', () => {
    const vlines = buildVlines(sampleLog(20), false, 80);
    const maxScroll = vlines.length - ROWS + 1;
    const api = render(<LogPane vlines={vlines} rows={ROWS} scroll={maxScroll} t={t} />);
    const f = strip(api.lastFrame());
    expect(f).toContain('Zdarzenie 1');
  });

  it('pusty log pokazuje komunikat', () => {
    const api = render(<LogPane vlines={[]} rows={ROWS} scroll={0} t={t} />);
    expect(strip(api.lastFrame())).toContain(t.LogEmpty);
  });
});
