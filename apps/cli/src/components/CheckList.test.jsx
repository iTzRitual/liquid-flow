import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import CheckList from './CheckList.jsx';
import { keys, press, frame } from '../../../../test/helpers/ink.js';

const t = {
  ...translationsFor('pl'),
  ShareActionSkip: 'Pomiń',
  ShareActionUpdate: 'Nadpisz',
  ShareActionRename: 'Zmień nazwę',
  ShareExistsBadge: 'już istnieje',
};

const sampleItems = () => [
  { key: 'Shop1', label: 'Shop1', hint: 'http://shop1.com' },
  { key: 'Shop2', label: 'Shop2', hint: 'http://shop2.com' },
  { key: 'Shop3', label: 'Shop3', hint: 'http://shop3.com', conflict: true },
];

function setup(extra) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const api = render(
    <CheckList title="CheckList Test" items={sampleItems()} onConfirm={onConfirm} onCancel={onCancel} t={t} maxRows={12} {...extra} />
  );
  return { api, onConfirm, onCancel };
}

describe('CheckList — render & interaction', () => {
  it('renders title, items with checkboxes and conflict row', () => {
    const { api } = setup();
    const f = frame(api);
    expect(f).toContain('CheckList Test');
    expect(f).toContain('[x] Shop1');
    expect(f).toContain('[x] Shop2');
    expect(f).toContain('[!] Shop3');
  });

  it('unchecks focused row on space key', async () => {
    const { api, onConfirm } = setup();
    // Shop1 focused, space to uncheck
    await press(api.stdin, ' ');
    const f = frame(api);
    expect(f).toContain('[ ] Shop1');

    await press(api.stdin, keys.enter);
    expect(onConfirm).toHaveBeenCalledWith([
      { Name: 'Shop2', action: 'add' },
      { Name: 'Shop3', action: 'skip' },
    ]);
  });

  it('toggles all normal rows on "a" key', async () => {
    const { api, onConfirm } = setup();
    await press(api.stdin, 'a');
    let f = frame(api);
    expect(f).toContain('[ ] Shop1');
    expect(f).toContain('[ ] Shop2');

    await press(api.stdin, 'a');
    f = frame(api);
    expect(f).toContain('[x] Shop1');
    expect(f).toContain('[x] Shop2');
  });

  it('cycles conflict actions with arrow keys and submits selections', async () => {
    const { api, onConfirm } = setup();
    // Navigate down to Shop3 (conflict row)
    await press(api.stdin, keys.down, keys.down);
    let f = frame(api);
    expect(f).toContain('Pomiń'); // default skip

    // Press right -> update
    await press(api.stdin, keys.right);
    f = frame(api);
    expect(f).toContain('Nadpisz');

    // Press right again -> rename
    await press(api.stdin, keys.right);
    f = frame(api);
    expect(f).toContain('Zmień nazwę');

    // Press right again -> back to skip
    await press(api.stdin, keys.right);
    f = frame(api);
    expect(f).toContain('Pomiń');

    // Press right once more -> update
    await press(api.stdin, keys.right);

    // Uncheck Shop2 by moving up to Shop2 and pressing space
    await press(api.stdin, keys.up, ' ');

    // Submit with Enter
    await press(api.stdin, keys.enter);
    expect(onConfirm).toHaveBeenCalledWith([
      { Name: 'Shop1', action: 'add' },
      { Name: 'Shop3', action: 'update' },
    ]);
  });

  it('calls onCancel on Esc key', async () => {
    const { api, onCancel } = setup();
    await press(api.stdin, keys.escape);
    expect(onCancel).toHaveBeenCalled();
  });
});
