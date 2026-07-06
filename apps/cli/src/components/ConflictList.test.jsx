import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import ConflictList from './ConflictList.jsx';
import { keys, press, frame } from '../../../../test/helpers/ink.js';

const t = translationsFor('pl');

const files = () => [
  { name: 'a.liquid', meta: 'lokalny nowszy', initial: 0,
    options: [{ label: 'Pobierz', value: 'download' }, { label: 'Wyślij', value: 'upload' }] },
  { name: 'b.liquid', meta: 'zdalny nowszy', initial: 1,
    options: [{ label: 'Pobierz', value: 'download' }, { label: 'Wyślij', value: 'upload' }] },
];

function setup(extra) {
  const onAction = vi.fn();
  const onBulk = vi.fn();
  const onCancel = vi.fn();
  const api = render(
    <ConflictList title="Konflikty" files={files()} onAction={onAction} onBulk={onBulk} onCancel={onCancel} maxRows={20} t={t} {...extra} />
  );
  return { api, onAction, onBulk, onCancel };
}

describe('ConflictList — akcje pojedyncze', () => {
  it('renderuje karty z nazwami i przyciskami akcji', () => {
    const f = frame(setup().api);
    expect(f).toContain('a.liquid');
    expect(f).toContain('b.liquid');
    expect(f).toContain('Pobierz');
    expect(f).toMatch(/›\s*a\.liquid/); // kursor na pierwszej karcie
  });

  it('Enter na pierwszej karcie woła onAction z domyślną akcją (initial=0)', async () => {
    const { api, onAction } = setup();
    await press(api.stdin, keys.enter);
    expect(onAction).toHaveBeenCalledWith('download', expect.objectContaining({ name: 'a.liquid' }));
  });

  it('→ przesuwa kursor akcji, Enter wykonuje drugą opcję', async () => {
    const { api, onAction } = setup();
    await press(api.stdin, keys.right, keys.enter);
    expect(onAction).toHaveBeenCalledWith('upload', expect.objectContaining({ name: 'a.liquid' }));
  });

  it('↓ przechodzi na drugą kartę i resetuje kursor do jej initial (1 = Wyślij)', async () => {
    const { api, onAction } = setup();
    await press(api.stdin, keys.down, keys.enter);
    expect(onAction).toHaveBeenCalledWith('upload', expect.objectContaining({ name: 'b.liquid' }));
  });

  it('Esc anuluje', async () => {
    const { api, onCancel } = setup();
    await press(api.stdin, keys.escape);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ConflictList — operacje seryjne (bulk)', () => {
  it('↓ poniżej kart trafia w stopkę bulk; Enter woła onBulk', async () => {
    const onBulk = vi.fn();
    const onAction = vi.fn();
    const bulk = [{ label: 'Pobierz wszystkie', value: 'downloadAll' }, { label: 'Wyślij wszystkie', value: 'uploadAll' }];
    const api = render(
      <ConflictList title="K" files={files()} bulk={bulk} onAction={onAction} onBulk={onBulk} maxRows={20} t={t} />
    );
    // 2 cards → the third ↓ lands on the bulk row
    await press(api.stdin, keys.down, keys.down, keys.enter);
    expect(onBulk).toHaveBeenCalledWith('downloadAll');
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('ConflictList — stała wysokość przy nawigacji', () => {
  // Regression: the conflicts screen (stuck to the bottom, log above it) must not
  // change height on ↑/↓ — otherwise the log "jumps". A list longer than the budget
  // (8 files, maxRows=10 → windowing); the height MUST be identical at every cursor position.
  it('renderuje identyczną liczbę wierszy na każdej pozycji kursora', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      name: `file${i}.liquid`, meta: 'lokalny nowszy', note: 'lokalny nowszy', initial: 0,
      options: [{ label: 'Pobierz', value: 'download' }, { label: 'Wyślij', value: 'upload' }],
    }));
    const bulk = [{ label: 'Pobierz wszystkie', value: 'downloadAll' }];
    const api = render(
      <ConflictList title="K" files={many} bulk={bulk} onAction={() => {}} onBulk={() => {}} maxRows={10} t={t} />
    );
    const heights = [];
    for (let n = 0; n <= many.length; n++) {
      heights.push(frame(api).split('\n').length);
      await press(api.stdin, keys.down);
    }
    expect(heights.every((h) => h === heights[0])).toBe(true);
  });
});

describe('ConflictList — niskie okno (degradacja kart)', () => {
  // Regression: on a low window the card degrades in height, but the
  // name+buttons row MUST remain visible (it used to disappear — the frame overflowed).
  const many = (n) => Array.from({ length: n }, (_, i) => ({
    name: `file${i}.liquid`, meta: 'lokalny nowszy', note: 'lokalny nowszy', initial: 0,
    options: [{ label: 'Pobierz', value: 'download' }, { label: 'Wyślij', value: 'upload' }],
  }));

  for (const maxRows of [3, 4, 5, 6]) {
    it(`pokazuje nazwę aktywnego pliku i nie przepełnia kadru (maxRows=${maxRows})`, () => {
      const bulk = [{ label: 'Pobierz wszystkie', value: 'downloadAll' }];
      const api = render(
        <ConflictList title="K" files={many(8)} bulk={bulk} onAction={() => {}} onBulk={() => {}} maxRows={maxRows} t={t} />
      );
      const f = frame(api);
      // The file name under the cursor (the first, file0) is visible.
      expect(f).toContain('file0.liquid');
      // No overflow: the box budget = maxRows + 4 (chrome: frame 2 + title 1 +
      // help 1) + bulk footer (1). The frame must not exceed it.
      expect(f.split('\n').length).toBeLessThanOrEqual(maxRows + 4 + 1);
    });
  }
});

describe('ConflictList — symetria wskaźników „więcej"', () => {
  // Regression: the top and bottom "↑/↓ more" indicators must sit against the
  // content the same way (a trailing blank card line used to give the bottom indicator extra spacing).
  it('dolny wskaźnik nie ma pustej linii nad sobą (odstęp jest MIĘDZY kartami)', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      name: `file${i}.liquid`, meta: 'meta', note: 'note', initial: 0,
      options: [{ label: 'Pobierz', value: 'download' }, { label: 'Wyślij', value: 'upload' }],
    }));
    const api = render(
      <ConflictList title="K" files={many} onAction={() => {}} maxRows={12} t={t} />
    );
    const lines = frame(api).split('\n');
    const belowIdx = lines.findIndex((l) => /↓\s*\d+/.test(l));
    expect(belowIdx).toBeGreaterThan(0);
    // The row right above the bottom indicator is card content (note/meta), NOT a blank line.
    expect(lines[belowIdx - 1].trim()).not.toBe('');
  });
});

describe('ConflictList — brak konfliktów', () => {
  it('pokazuje komunikat o braku konfliktów', () => {
    const api = render(<ConflictList title="K" files={[]} onAction={() => {}} t={t} />);
    expect(frame(api)).toContain(t.NoConflicts);
  });
});

describe('ConflictList — pamięć podświetlonej karty', () => {
  it('initialIndex podświetla zadaną kartę (powrót Esc z podglądu)', () => {
    const { api } = setup({ initialIndex: 1 });
    expect(frame(api)).toMatch(/›\s*b\.liquid/);
  });

  it('onIndexChange raportuje pozycję karty przy nawigacji', async () => {
    const onIndexChange = vi.fn();
    const { api } = setup({ onIndexChange });
    await press(api.stdin, keys.down);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('kursor ←/→ startuje od bezpiecznego initial przywróconej karty (nie jest pamiętany)', async () => {
    const { api, onAction } = setup({ initialIndex: 1 });
    await press(api.stdin, keys.enter); // b.liquid ma initial=1 → „upload”
    expect(onAction).toHaveBeenCalledWith('upload', expect.objectContaining({ name: 'b.liquid' }));
  });
});
