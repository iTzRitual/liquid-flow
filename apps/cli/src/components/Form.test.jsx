import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import Form from './Form.jsx';
import { keys, press, frame } from '../../../../test/helpers/ink.js';

const t = translationsFor('pl');

describe('Form — pola tekstowe', () => {
  it('Enter zatwierdza pole i przechodzi do kolejnego; po ostatnim onSubmit', async () => {
    const onSubmit = vi.fn();
    const fields = [
      { name: 'login', label: 'Login', initial: 'webmaster' },
      { name: 'url', label: 'URL', initial: 'https://x.pl' },
    ];
    const api = render(<Form title="Połącz" fields={fields} onSubmit={onSubmit} t={t} />);
    await press(api.stdin, keys.enter); // confirm login (initial)
    expect(onSubmit).not.toHaveBeenCalled();
    await press(api.stdin, keys.enter); // confirm url → submit
    expect(onSubmit).toHaveBeenCalledWith({ login: 'webmaster', url: 'https://x.pl' });
  });

  it('Esc anuluje formularz', async () => {
    const onCancel = vi.fn();
    const fields = [{ name: 'a', label: 'A', initial: 'x' }];
    const api = render(<Form title="F" fields={fields} onSubmit={() => {}} onCancel={onCancel} t={t} />);
    await press(api.stdin, keys.escape);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('puste wymagane pole nie przechodzi dalej', async () => {
    const onSubmit = vi.fn();
    const fields = [
      { name: 'a', label: 'A', initial: '' },          // wymagane, puste
      { name: 'b', label: 'B', initial: 'ok' },
    ];
    const api = render(<Form title="F" fields={fields} onSubmit={onSubmit} t={t} />);
    await press(api.stdin, keys.enter); // an attempt to advance from an empty required field
    await press(api.stdin, keys.enter);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Form — pole wyboru (choice)', () => {
  it('strzałki zmieniają opcję, Enter zatwierdza wybraną wartość', async () => {
    const onSubmit = vi.fn();
    const fields = [
      { name: 'save', label: 'Zapisać hasło', type: 'choice',
        options: [{ label: 'Tak', value: true }, { label: 'Nie', value: false }] },
    ];
    const api = render(<Form title="F" fields={fields} onSubmit={onSubmit} t={t} />);
    // defaults to the first option (true); → toggles to false
    await press(api.stdin, keys.right, keys.enter);
    expect(onSubmit).toHaveBeenCalledWith({ save: false });
  });

  it('domyślna wartość (initial) brana, gdy bez interakcji', async () => {
    const onSubmit = vi.fn();
    const fields = [
      { name: 'save', label: 'Zapisać', type: 'choice', initial: true,
        options: [{ label: 'Tak', value: true }, { label: 'Nie', value: false }] },
    ];
    const api = render(<Form title="F" fields={fields} onSubmit={onSubmit} t={t} />);
    await press(api.stdin, keys.enter);
    expect(onSubmit).toHaveBeenCalledWith({ save: true });
  });
});
