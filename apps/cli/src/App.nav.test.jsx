import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import { keys, press, frame, flush } from '../../../test/helpers/ink.js';

// Integration test for cursor-position memory when going back with Esc —
// especially for transitions BETWEEN screens of the SAME type (picker → picker in
// the /git submenu), where without a unique `key` React reused the instance and
// lost the parent's position. We mock useController to inject a connected state
// (shop + template + git repo) without network/disk.
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
const cur = (label) => new RegExp('›\\s*' + label); // the cursor (›) on the given label

beforeEach(() => {
  hookValue = {
    ctrl: fakeCtrl,
    ready: true,
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

// Open the /git menu and wait for the async gitStatus → openPicker.
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

    // Move down to "Branches" (after two toggles + Checkpoint + Pull = index 4).
    await press(api.stdin, keys.down, keys.down, keys.down, keys.down);
    expect(frame(api)).toMatch(cur(t.GitBranches));

    // Enter the "Branches" submenu (another picker — the same screen type).
    await press(api.stdin, keys.enter);
    await wait();
    expect(frame(api)).toContain(t.GitBranchCreate);

    // Esc — return to the git menu WITH THE CURSOR on "Branches", not at the top of the list.
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

    // git menu → "Branches"
    await press(api.stdin, keys.down, keys.down, keys.down, keys.down, keys.enter);
    await wait();
    // submenu: "Create" (0) / "Switch" (1) → move down to "Switch"
    await press(api.stdin, keys.down);
    expect(frame(api)).toMatch(cur(t.GitBranchSwitch));
    // enter the branch list (async gitListBranches → another picker)
    await press(api.stdin, keys.enter);
    await wait();
    expect(frame(api)).toContain('feature-x');
    // Esc → return to the submenu with the cursor on "Switch"
    await press(api.stdin, keys.escape);
    await wait();
    expect(frame(api)).toMatch(cur(t.GitBranchSwitch));
  });
});
