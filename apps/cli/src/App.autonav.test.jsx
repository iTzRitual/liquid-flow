import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor, MismatchType } from '@liquidflow/core';
import { keys, press, frame, flush } from '../../../test/helpers/ink.js';

// Auto-navigation after an IDE save: `/conflicts` → Preview opens the diff screen
// (mode.type === 'diff') and remembers WHICH file it is viewing (`watchMismatch`,
// see commands.js). In the real app the watcher uploads the file after an IDE save,
// and the next polling cycle (`mismatches`, in useController) no longer contains
// it — App.jsx detects this and navigates back on its own: to the refreshed
// conflict list (when others remain) or to the main screen (when it was the last
// one). Here we simulate a "poll" by mutating `hookValue.mismatches` + `rerender`,
// without real network/SOAP.
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
    ready: true,
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

// Enters /conflicts and immediately into the first file's Preview (Timestamp has
// `initial: 2` = "preview", so a single Enter after entering the list is enough).
async function openPreview(api) {
  api.stdin.write('/conflicts');
  await flush();
  await press(api.stdin, keys.enter); // runs the /conflicts command
  await wait(60);
  await press(api.stdin, keys.enter); // the file card, default action = Preview
  await wait(60);
}

describe('App — auto-nawigacja po rozwiązaniu konfliktu w tle', () => {
  it('gdy oglądany plik znika z mismatches, ale zostają inne — wraca do listy konfliktów', async () => {
    const api = render(<App />);
    await flush();
    await openPreview(api);
    expect(frame(api)).toContain(t.DiffTitle.replace('{name}', 'a.liquid'));

    hookValue = { ...hookValue, mismatches: [conflictB] }; // "a" resolved, "b" remains
    api.rerender(<App />);
    await wait(60);

    const f = frame(api);
    expect(f).toContain(t.FileConflicts);
    expect(f).toContain('b.liquid');
    expect(f).not.toContain('a.liquid');
  });

  it('gdy oglądany plik był ostatnim konfliktem — pokazuje ekran "brak konfliktów" (nie znika od razu)', async () => {
    hookValue.mismatches = [conflictA];
    const api = render(<App />);
    await flush();
    await openPreview(api);
    expect(frame(api)).toContain(t.DiffTitle.replace('{name}', 'a.liquid'));

    hookValue = { ...hookValue, mismatches: [] };
    api.rerender(<App />);
    await wait(60);

    const f = frame(api);
    expect(f).not.toContain('a.liquid');
    expect(f).toContain(t.NoConflicts);
  });
});
