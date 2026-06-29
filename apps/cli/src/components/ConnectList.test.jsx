import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import ConnectList from './ConnectList.jsx';
import { keys, press, frame } from '../../../../test/helpers/ink.js';

const t = translationsFor('pl');

const shops = () => [
  { label: 'walter', hint: '● bieżący', shop: { Id: 1 } },
  { label: 'demo', hint: 'https://demo.pl', shop: { Id: 2 } },
];
const actions = () => [
  { key: 'logout', label: t.DisconnectSession },
  { key: 'add', label: t.AddConnectionShort },
  { key: 'remove', label: t.RemoveShopTitle },
];

function setup(extra) {
  const onShop = vi.fn();
  const onAction = vi.fn();
  const onCancel = vi.fn();
  const api = render(
    <ConnectList title={t.ConnectToShop} shops={shops()} actions={actions()} onShop={onShop} onAction={onAction} onCancel={onCancel} maxRows={16} t={t} {...extra} />
  );
  return { api, onShop, onAction, onCancel };
}

describe('ConnectList — render', () => {
  it('listuje sklepy i wiersz akcji w stopce', () => {
    const f = frame(setup().api);
    expect(f).toContain('walter');
    expect(f).toContain('demo');
    expect(f).toContain(t.AddConnectionShort);
    expect(f).toMatch(/›\s*walter/); // kursor na pierwszym sklepie
  });

  it('świeży start (brak sklepów) pokazuje tylko akcję „Dodaj”', () => {
    const api = render(
      <ConnectList title={t.ConnectToShop} shops={[]} actions={[{ key: 'add', label: t.AddConnectionShort }]} onShop={() => {}} onAction={() => {}} t={t} />
    );
    const f = frame(api);
    expect(f).toContain(t.AddConnectionShort);
    expect(f).not.toContain('walter');
  });
});

describe('ConnectList — nawigacja', () => {
  it('Enter na sklepie łączy (onShop z obiektem sklepu)', async () => {
    const { api, onShop } = setup();
    await press(api.stdin, keys.enter);
    expect(onShop).toHaveBeenCalledWith({ Id: 1 });
  });

  it('↓ przez sklepy wchodzi w stopkę; ↑↓ chodzi po tej samej sekwencji', async () => {
    const { api, onShop, onAction } = setup();
    // 2 sklepy → trzeci ↓ ląduje na pierwszym przycisku (logout)
    await press(api.stdin, keys.down, keys.down, keys.enter);
    expect(onAction).toHaveBeenCalledWith('logout');
    expect(onShop).not.toHaveBeenCalled();
  });

  it('→ w stopce przechodzi między przyciskami', async () => {
    const { api, onAction } = setup();
    // wejdź w stopkę (na logout), → na add, → na remove
    await press(api.stdin, keys.down, keys.down, keys.right, keys.right, keys.enter);
    expect(onAction).toHaveBeenCalledWith('remove');
  });

  it('Esc anuluje', async () => {
    const { api, onCancel } = setup();
    await press(api.stdin, keys.escape);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectList — pamięć pozycji kursora', () => {
  it('initialIndex podświetla zadany sklep (powrót Esc z formularza/sub-pickera)', () => {
    const { api } = setup({ initialIndex: 1 });
    expect(frame(api)).toMatch(/›\s*demo/);
  });

  it('initialIndex może wskazywać przycisk stopki', async () => {
    const { api, onAction } = setup({ initialIndex: 2 }); // 2 sklepy → pierwszy przycisk (logout)
    await press(api.stdin, keys.enter);
    expect(onAction).toHaveBeenCalledWith('logout');
  });

  it('onIndexChange raportuje pozycję przy nawigacji', async () => {
    const onIndexChange = vi.fn();
    const { api } = setup({ onIndexChange });
    await press(api.stdin, keys.down);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });
});
