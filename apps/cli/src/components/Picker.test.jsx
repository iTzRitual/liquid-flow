import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import Picker from './Picker.jsx';
import { keys, press, frame } from '../../../../test/helpers/ink.js';

const t = translationsFor('pl');

function setup(props) {
  const onSelect = vi.fn();
  const onCancel = vi.fn();
  const onSlash = vi.fn();
  const items = props?.items || [
    { label: 'Pierwsza', value: 'a' },
    { label: 'Druga', value: 'b' },
    { label: 'Trzecia', value: 'c' },
  ];
  const api = render(
    <Picker title="Wybierz" items={items} onSelect={onSelect} onCancel={onCancel} onSlash={onSlash} t={t} {...props} />
  );
  return { api, onSelect, onCancel, onSlash, items };
}

describe('Picker — nawigacja i wybór', () => {
  it('renderuje tytuł i pozycje, kursor na pierwszej', () => {
    const { api } = setup();
    const f = frame(api);
    expect(f).toContain('Wybierz');
    expect(f).toContain('Pierwsza');
    expect(f).toMatch(/›\s*Pierwsza/); // kursor (›) na pierwszej pozycji
  });

  it('Enter wybiera bieżącą pozycję (zwraca item + index)', async () => {
    const { api, onSelect, items } = setup();
    await press(api.stdin, keys.enter);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(items[0], 0);
  });

  it('↓ przesuwa kursor, Enter wybiera kolejną', async () => {
    const { api, onSelect, items } = setup();
    await press(api.stdin, keys.down, keys.down, keys.enter);
    expect(onSelect).toHaveBeenCalledWith(items[2], 2);
  });

  it('↑ z pierwszej zawija na ostatnią (cyklicznie)', async () => {
    const { api, onSelect, items } = setup();
    await press(api.stdin, keys.up, keys.enter);
    expect(onSelect).toHaveBeenCalledWith(items[2], 2);
  });

  it('Esc wywołuje onCancel, nie onSelect', async () => {
    const { api, onCancel, onSelect } = setup();
    await press(api.stdin, keys.escape);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('„/” wywołuje onSlash', async () => {
    const { api, onSlash } = setup();
    await press(api.stdin, keys.slash);
    expect(onSlash).toHaveBeenCalledTimes(1);
  });
});

describe('Picker — pamięć pozycji kursora', () => {
  it('initialIndex ustawia kursor na zadanej pozycji', () => {
    const { api } = setup({ initialIndex: 2 });
    expect(frame(api)).toMatch(/›\s*Trzecia/);
  });

  it('initialIndex jest przycięty do liczby pozycji', () => {
    const { api } = setup({ initialIndex: 99 });
    expect(frame(api)).toMatch(/›\s*Trzecia/); // ostatnia
  });

  it('onIndexChange raportuje pozycję przy nawigacji (pamięć dla rodzica)', async () => {
    const onIndexChange = vi.fn();
    const { api } = setup({ onIndexChange });
    await press(api.stdin, keys.down, keys.down);
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
  });
});

describe('Picker — przełączniki (toggle)', () => {
  it('←/→ przełącza wartość i woła onToggle, bez onSelect', async () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const items = [{ kind: 'toggle', label: 'Auto-commit', on: false, onToggle }];
    const api = render(<Picker title="Git" items={items} onSelect={onSelect} t={t} />);
    await press(api.stdin, keys.right);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onSelect).not.toHaveBeenCalled();
    expect(frame(api)).toContain('Auto-commit');
  });
});

describe('Picker — pusta lista', () => {
  it('pokazuje komunikat o pustej liście i nie wybiera na Enter', async () => {
    const onSelect = vi.fn();
    const api = render(<Picker title="Puste" items={[]} onSelect={onSelect} t={t} />);
    expect(frame(api)).toContain(t.PickerEmpty);
    await press(api.stdin, keys.enter);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
