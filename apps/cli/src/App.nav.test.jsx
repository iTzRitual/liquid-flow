import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import { keys, press, frame, flush } from '../../../test/helpers/ink.js';

// Test integracyjny pamięci pozycji kursora przy cofaniu Esc — szczególnie dla
// przejść MIĘDZY ekranami tego SAMEGO typu (picker → picker w podmenu /git),
// gdzie bez unikalnego `key` React reużywał instancję i gubił pozycję rodzica.
// Mockujemy useController, by wstrzyknąć stan połączony (sklep + szablon + repo
// git) bez sieci/dysku.
const fakeCtrl = {
  gitStatus: vi.fn(async () => ({ available: true, isRepo: true, commitCount: 3, autoCommit: true, autoPush: false, remote: '' })),
  gitListBranches: vi.fn(async () => ['main', 'feature-x', 'feature-y']),
  gitHistory: vi.fn(async () => []),
  setUiPref: vi.fn(),
};

let hookValue;
vi.mock('./useController.js', () => ({
  useController: () => hookValue,
}));

const { default: App } = await import('./App.jsx');

const t = translationsFor('pl');
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const cur = (label) => new RegExp('›\\s*' + label); // kursor (›) na danej etykiecie

beforeEach(() => {
  hookValue = {
    ctrl: fakeCtrl,
    t,
    state: { currentShop: { Name: 'shop' }, currentTemplate: { Id: '1', Name: 'tpl' }, language: 'pl', logWrap: false, headerMode: 'auto' },
    mismatches: [],
    log: [],
    logVersion: 0,
    git: { isRepo: true },
    shops: [],
    progress: null,
    refreshShops: vi.fn(),
    clearLog: vi.fn(),
  };
});

// Otwórz menu /git i poczekaj na async gitStatus → openPicker.
async function openGit(api) {
  api.stdin.write('/git');
  await flush();
  await press(api.stdin, keys.enter);
  await wait(60);
}

describe('App — pamięć pozycji kursora w /git (picker → picker)', () => {
  it('Esc z podmenu „Gałęzie” wraca na podświetlony wiersz menu git', async () => {
    const api = render(<App />);
    await flush();
    await openGit(api);
    expect(frame(api)).toContain(t.GitBranches);

    // Zejdź na „Branches” (po dwóch togglach + Checkpoint + Pull = index 4).
    await press(api.stdin, keys.down, keys.down, keys.down, keys.down);
    expect(frame(api)).toMatch(cur(t.GitBranches));

    // Wejdź w podmenu „Branches” (kolejny picker — ten sam typ ekranu).
    await press(api.stdin, keys.enter);
    await wait();
    expect(frame(api)).toContain(t.GitBranchCreate);

    // Esc — powrót do menu git Z KURSOREM na „Branches”, nie na górze listy.
    await press(api.stdin, keys.escape);
    await wait();
    const f = frame(api);
    expect(f).toContain(t.GitBranches);
    expect(f).toMatch(cur(t.GitBranches));
  });

  it('Esc z listy gałęzi wraca na „Przełącz” w podmenu (dwa poziomy picker→picker)', async () => {
    const api = render(<App />);
    await flush();
    await openGit(api);

    // git menu → „Branches”
    await press(api.stdin, keys.down, keys.down, keys.down, keys.down, keys.enter);
    await wait();
    // podmenu: „Utwórz” (0) / „Przełącz” (1) → zejdź na „Przełącz”
    await press(api.stdin, keys.down);
    expect(frame(api)).toMatch(cur(t.GitBranchSwitch));
    // wejdź w listę gałęzi (async gitListBranches → kolejny picker)
    await press(api.stdin, keys.enter);
    await wait();
    expect(frame(api)).toContain('feature-x');
    // Esc → powrót do podmenu z kursorem na „Przełącz”
    await press(api.stdin, keys.escape);
    await wait();
    expect(frame(api)).toMatch(cur(t.GitBranchSwitch));
  });
});
