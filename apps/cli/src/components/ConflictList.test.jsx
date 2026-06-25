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
    // 2 karty → trzeci ↓ ląduje na wierszu bulk
    await press(api.stdin, keys.down, keys.down, keys.enter);
    expect(onBulk).toHaveBeenCalledWith('downloadAll');
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('ConflictList — brak konfliktów', () => {
  it('pokazuje komunikat o braku konfliktów', () => {
    const api = render(<ConflictList title="K" files={[]} onAction={() => {}} t={t} />);
    expect(frame(api)).toContain(t.NoConflicts);
  });
});
