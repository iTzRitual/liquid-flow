import { describe, it, expect, vi } from 'vitest';
import { translationsFor, MismatchType } from '@liquidflow/core';
import { buildCommands } from './commands.js';

const t = translationsFor('pl');

// Minimalny ctx — stubujemy helpery powłoki; `withLoading` wykonuje async fn od
// razu (bez loadera), a `openConflicts` przechwytuje payload do asercji.
function makeCtx(overrides = {}) {
  const captured = {};
  const ctx = {
    ctrl: {
      recheckMismatches: vi.fn(async () => []),
      runCommand: vi.fn(async () => []),
    },
    t,
    state: { currentShop: { Name: 'x' }, currentTemplate: { Id: 1, Name: 'tpl' } },
    git: {},
    shops: [],
    refreshShops: vi.fn(),
    clearLog: vi.fn(),
    openPicker: vi.fn(),
    openForm: vi.fn(),
    openConflicts: vi.fn((payload) => { captured.conflicts = payload; }),
    openConnect: vi.fn(),
    openDiff: vi.fn(),
    logWrap: false,
    setLogWrap: vi.fn(),
    exit: vi.fn(),
    safe: (fn) => fn(),
    skipToInput: vi.fn(),
    backToInput: vi.fn(),
    withLoading: (label, fn) => fn(),
    dropParent: vi.fn(),
    ...overrides,
  };
  return { ctx, captured };
}

describe('buildCommands — rejestr', () => {
  it('zwraca komplet slash-komend z przetłumaczonymi opisami', () => {
    const { ctx } = makeCtx();
    const cmds = buildCommands(ctx);
    expect(cmds.map((c) => c.name)).toEqual([
      '/connect', '/templates', '/conflicts', '/git', '/open', '/clear', '/settings', '/exit(quit)',
    ]);
    expect(cmds.every((c) => typeof c.desc === 'string' && c.desc.length > 0)).toBe(true);
    expect(cmds.every((c) => typeof c.run === 'function')).toBe(true);
  });
});

describe('/conflicts — mapowanie typu konfliktu na akcje', () => {
  function runConflicts(mismatches) {
    const { ctx, captured } = makeCtx({
      ctrl: { recheckMismatches: vi.fn(async () => mismatches), runCommand: vi.fn(async () => []) },
    });
    const cmds = buildCommands(ctx);
    cmds.find((c) => c.name === '/conflicts').run();
    return captured;
  }

  const destructive = new Set(['removeLocal', 'removeRemote']);

  it('LocalMissing → Pobierz / Usuń w sklepie, domyślnie NIE usuwanie', async () => {
    const cap = runConflicts([{ File: { Name: 'a', Mode: 0 }, Type: MismatchType.LocalMissing, FileTs: null, LocalTs: null, RemoteTs: '2026-01-01' }]);
    await Promise.resolve();
    const f = cap.conflicts.files[0];
    expect(f.options.map((o) => o.value)).toEqual(['download', 'removeRemote', 'preview']);
    expect(destructive.has(f.options[f.initial].value)).toBe(false);
  });

  it('RemoteMissing → Wyślij / Usuń lokalnie, domyślnie NIE usuwanie', async () => {
    const cap = runConflicts([{ File: { Name: 'b', Mode: 0 }, Type: MismatchType.RemoteMissing, FileTs: '2026-01-01', LocalTs: null, RemoteTs: null }]);
    await Promise.resolve();
    const f = cap.conflicts.files[0];
    expect(f.options.map((o) => o.value)).toEqual(['upload', 'removeLocal', 'preview']);
    expect(destructive.has(f.options[f.initial].value)).toBe(false);
  });

  it('Timestamp: lokalny nowszy → domyślnie Wyślij; zdalny nowszy → domyślnie Pobierz', async () => {
    const localNewer = runConflicts([{ File: { Name: 'c', Mode: 0 }, Type: MismatchType.Timestamp, FileTs: '2026-06-01', LocalTs: '2026-01-01', RemoteTs: '2026-01-01' }]);
    await Promise.resolve();
    let f = localNewer.conflicts.files[0];
    expect(f.options[f.initial].value).toBe('upload');

    const remoteNewer = runConflicts([{ File: { Name: 'c', Mode: 0 }, Type: MismatchType.Timestamp, FileTs: '2026-01-01', LocalTs: '2026-01-01', RemoteTs: '2026-06-01' }]);
    await Promise.resolve();
    f = remoteNewer.conflicts.files[0];
    expect(f.options[f.initial].value).toBe('download');
  });

  it('operacje seryjne pojawiają się wg typów konfliktów', async () => {
    const cap = runConflicts([
      { File: { Name: 'a', Mode: 0 }, Type: MismatchType.LocalMissing, FileTs: null, LocalTs: null, RemoteTs: '2026-01-01' },
      { File: { Name: 'b', Mode: 0 }, Type: MismatchType.RemoteMissing, FileTs: '2026-01-01', LocalTs: null, RemoteTs: null },
    ]);
    await Promise.resolve();
    const values = cap.conflicts.bulk.map((b) => b.value);
    expect(values).toContain('downloadAll'); // LocalMissing → pobierz wszystkie
    expect(values).toContain('uploadAll');   // RemoteMissing → wyślij wszystkie
  });
});
