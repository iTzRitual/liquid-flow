import React from 'react';
import { describe, it, expect } from 'vitest';
import { translationsFor } from '@liquidflow/core';
import Header from './Header.jsx';
import { HEADER_STACK_COLS } from './Header.jsx';
import { renderFrame } from '../../../../test/helpers/ink.js';

const t = translationsFor('pl');
const state = {
  currentShop: { Name: 'walter', Url: 'https://walter.comarch-esklep.pl' },
  currentTemplate: { Id: 3, Name: 'new' },
};
const git = { active: true, autoCommit: true, autoPush: false };

const WIDTHS = [120, 90, 76, 60, 53, 40, 30];

describe('Header — anty-przepełnienie i nierozpadające się logo', () => {
  it.each(WIDTHS)('żaden wiersz nie przekracza szerokości cols=%i', async (cols) => {
    const lines = await renderFrame(
      <Header state={state} git={git} mismatches={[1, 2, 3]} cols={cols} t={t} />, cols
    );
    for (const ln of lines) {
      expect([...ln].length, `wiersz dłuższy niż ${cols}: "${ln}"`).toBeLessThanOrEqual(cols);
    }
  });

  it.each(WIDTHS)('logo ASCII pozostaje w jednym kawałku (cols=%i)', async (cols) => {
    const f = (await renderFrame(<Header state={state} git={git} mismatches={[]} cols={cols} t={t} />, cols)).join('\n');
    // Contiguous glyph runs from the top and bottom of the logo — if it wrapped, these would break.
    expect(f).toContain('▄████████▄');
    expect(f).toContain('▀███████▀');
  });

  it('pokazuje nazwę sklepu i wskaźnik konfliktów, gdy są konflikty', async () => {
    const f = (await renderFrame(<Header state={state} git={git} mismatches={[1, 2, 3, 4]} cols={90} t={t} />, 90)).join('\n');
    expect(f).toContain('walter');
    expect(f).toContain('Konflikty: 4'); // the conflicts indicator with a count
    expect(f).toContain('/conflicts');
  });

  it('bez konfliktów nie renderuje wskaźnika', async () => {
    const f = (await renderFrame(<Header state={state} git={git} mismatches={[]} cols={90} t={t} />, 90)).join('\n');
    // the conflicts indicator (red) should not appear
    expect(f).not.toMatch(/[Kk]onflikt/);
  });

  it('compact: jeden wiersz, bez logo ASCII, ze sklepem/szablonem/konfliktami', async () => {
    const lines = await renderFrame(
      <Header state={state} git={git} mismatches={[1, 2, 3]} cols={80} t={t} compact />, 80
    );
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    expect(nonEmpty.length).toBe(1); // one content row
    const f = nonEmpty[0];
    expect(f).toContain('Liquid Flow');
    expect(f).toContain('walter');
    expect(f).toContain('new');
    expect(f).toContain('3'); // the conflicts counter
    expect(f).not.toContain('████'); // no ASCII logo
  });

  it('compact: przycina się do szerokości okna', async () => {
    const cols = 24;
    const lines = await renderFrame(
      <Header state={state} git={git} mismatches={[5]} cols={cols} t={t} compact />, cols
    );
    for (const ln of lines) expect([...ln].length).toBeLessThanOrEqual(cols);
  });

  it('układ pionowy (stacked) jest wyższy od 2-kolumnowego przy wąskim oknie', async () => {
    const wide = await renderFrame(<Header state={state} git={git} mismatches={[]} cols={90} t={t} />, 90);
    const narrow = await renderFrame(<Header state={state} git={git} mismatches={[]} cols={HEADER_STACK_COLS - 1} t={t} />, HEADER_STACK_COLS - 1);
    expect(narrow.length).toBeGreaterThan(wide.length);
  });
});
