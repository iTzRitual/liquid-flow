import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor, MismatchType } from '@liquidflow/core';
import { keys, press, frame, flush } from '../../../test/helpers/ink.js';

// Auto-nawigacja po zapisie w IDE: `/conflicts` → Podgląd otwiera ekran diff
// (mode.type === 'diff') i zapamiętuje, KTÓRY plik ogląda (`watchMismatch`,
// patrz commands.js). W realnej apce watcher wysyła plik po zapisie w IDE, a
// kolejny cykl pollingu (`mismatches`, w useController) już go nie zawiera —
// App.jsx wykrywa to i sam wraca: do odświeżonej listy konfliktów (gdy zostały
// inne) albo na ekran główny (gdy to był ostatni). Tu symulujemy "poll" przez
// mutację `hookValue.mismatches` + `rerender`, bez prawdziwej sieci/SOAP.
const conflictA = { File: { Name: 'a.liquid', Mode: 0 }, Type: MismatchType.Timestamp, FileTs: '2026-06-01', LocalTs: '2026-01-01', RemoteTs: '2026-01-01' };
const conflictB = { File: { Name: 'b.liquid', Mode: 0 }, Type: MismatchType.Timestamp, FileTs: '2026-06-01', LocalTs: '2026-01-01', RemoteTs: '2026-01-01' };

const fakeCtrl = {
  recheckMismatches: vi.fn(async () => hookValue.mismatches),
  previewConflict: vi.fn(async () => ({ kind: 'text', local: 'a', remote: 'b', diff: [] })),
  setUiPref: vi.fn(),
  localFilePath: vi.fn(() => '/tmp/a.liquid'),
};

let hookValue;
vi.mock('./useController.js', () => ({
  useController: () => hookValue,
}));

const { default: App } = await import('./App.jsx');

const t = translationsFor('pl');
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  hookValue = {
    ctrl: fakeCtrl,
    t,
    state: { currentShop: { Name: 'shop' }, currentTemplate: { Id: '1', Name: 'tpl' }, language: 'pl', logWrap: false, headerMode: 'auto' },
    mismatches: [conflictA, conflictB],
    log: [],
    logVersion: 0,
    git: { isRepo: true },
    shops: [],
    progress: null,
    refreshShops: vi.fn(),
    clearLog: vi.fn(),
  };
});

// Wchodzi do /conflicts i od razu w Podgląd pierwszego pliku (Timestamp ma
// `initial: 2` = "preview", więc samo Enter po wejściu na listę wystarczy).
async function openPreview(api) {
  api.stdin.write('/conflicts');
  await flush();
  await press(api.stdin, keys.enter); // uruchamia komendę /conflicts
  await wait(60);
  await press(api.stdin, keys.enter); // karta pliku, akcja domyślna = Podgląd
  await wait(60);
}

describe('App — auto-nawigacja po rozwiązaniu konfliktu w tle', () => {
  it('gdy oglądany plik znika z mismatches, ale zostają inne — wraca do listy konfliktów', async () => {
    const api = render(<App />);
    await flush();
    await openPreview(api);
    expect(frame(api)).toContain(t.DiffTitle.replace('{name}', 'a.liquid'));

    hookValue = { ...hookValue, mismatches: [conflictB] }; // "a" rozwiązane, "b" zostaje
    api.rerender(<App />);
    await wait(60);

    const f = frame(api);
    expect(f).toContain(t.FileConflicts);
    expect(f).toContain('b.liquid');
    expect(f).not.toContain('a.liquid');
  });

  it('gdy oglądany plik był ostatnim konfliktem — wraca na ekran główny', async () => {
    hookValue.mismatches = [conflictA];
    const api = render(<App />);
    await flush();
    await openPreview(api);
    expect(frame(api)).toContain(t.DiffTitle.replace('{name}', 'a.liquid'));

    hookValue = { ...hookValue, mismatches: [] };
    api.rerender(<App />);
    await wait(60);

    const f = frame(api);
    expect(f).not.toContain(t.FileConflicts);
    expect(f).not.toContain('a.liquid');
  });
});
