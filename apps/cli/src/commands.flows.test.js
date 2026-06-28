import { describe, it, expect, vi } from 'vitest';
import { translationsFor, MismatchType } from '@liquidflow/core';
import { buildCommands } from './commands.js';

const t = translationsFor('pl');
const tick = () => new Promise((r) => setTimeout(r, 0));

// Elastyczny ctx: przechwytuje WSZYSTKIE otwarcia (pickery/formularze/connect/
// conflicts) do tablic, a helpery wykonawcze (safe/withLoading) odpalają od razu.
function makeCtx(overrides = {}) {
  const cap = { pickers: [], forms: [], connect: null, conflicts: null };
  const ctx = {
    ctrl: {
      getCurrentShop: () => ({ Name: 'x' }),
      listTemplates: vi.fn(async () => [{ Id: 5, Name: 'Topaz', Locked: false }]),
      recheckMismatches: vi.fn(async () => []),
      runCommand: vi.fn(async () => []),
      gitStatus: vi.fn(async () => ({ available: true, isRepo: true, commitCount: 2, autoCommit: false, autoPush: false, remote: null })),
      setLanguage: vi.fn(),
      logout: vi.fn(),
      removeShop: vi.fn(),
      currentFolder: () => null,
      ...(overrides.ctrl || {}),
    },
    t,
    state: { currentShop: { Name: 'x' }, currentTemplate: { Id: 5, Name: 'Topaz' } },
    git: {},
    shops: [{ Id: 1, Name: 'sklep', Url: 'https://s.pl' }],
    refreshShops: vi.fn(),
    clearLog: vi.fn(),
    openPicker: vi.fn((title, items, onSelect) => { cap.pickers.push({ title, items, onSelect }); }),
    openForm: vi.fn((title, fields, onSubmit) => { cap.forms.push({ title, fields, onSubmit }); }),
    openConflicts: vi.fn((payload) => { cap.conflicts = payload; }),
    openConnect: vi.fn((payload) => { cap.connect = payload; }),
    logWrap: false,
    setLogWrap: vi.fn(),
    headerPref: 'auto',
    setHeaderPref: vi.fn(),
    exit: vi.fn(),
    safe: (fn) => fn(),
    skipToInput: vi.fn(),
    backToInput: vi.fn(),
    withLoading: (label, fn) => fn(),
    dropParent: vi.fn(),
    ...overrides,
  };
  return { ctx, cap };
}

const run = (ctx, name) => buildCommands(ctx).find((c) => c.name === name).run();

describe('strażnicy (guards)', () => {
  it('/templates bez sklepu → nie otwiera pickera', async () => {
    const { ctx, cap } = makeCtx({ ctrl: { getCurrentShop: () => null } });
    run(ctx, '/templates');
    await tick();
    expect(cap.pickers).toHaveLength(0);
  });

  it('/git bez aktywnego szablonu → nie otwiera menu', async () => {
    const { ctx, cap } = makeCtx({ state: { currentShop: { Name: 'x' }, currentTemplate: null } });
    run(ctx, '/git');
    await tick();
    expect(cap.pickers).toHaveLength(0);
  });

  it('/conflicts bez szablonu → nie otwiera ekranu', async () => {
    const { ctx, cap } = makeCtx({ state: { currentShop: { Name: 'x' }, currentTemplate: null } });
    run(ctx, '/conflicts');
    await tick();
    expect(cap.conflicts).toBeNull();
  });
});

describe('/templates', () => {
  it('otwiera picker z listą szablonów', async () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/templates');
    await tick();
    expect(cap.pickers).toHaveLength(1);
    expect(cap.pickers[0].items[0].label).toContain('Topaz');
  });
});

describe('/settings i język', () => {
  it('otwiera menu z inline toggleami; toggle języka woła setLanguage bez podmenu', () => {
    const { ctx, cap } = makeCtx({ state: { currentShop: { Name: 'x' }, currentTemplate: { Id: 5, Name: 'Topaz' }, language: 'pl' } });
    run(ctx, '/settings');
    expect(cap.pickers).toHaveLength(1);
    const menu = cap.pickers[0];
    const toggles = menu.items.filter((i) => i.kind === 'toggle');
    expect(toggles).toHaveLength(3);

    const langToggle = menu.items.find((i) => i.options?.some((o) => o.label === 'English'));
    expect(langToggle).toBeTruthy();
    expect(langToggle.on).toBe('pl');
    langToggle.onToggle('en');
    expect(ctx.ctrl.setLanguage).toHaveBeenCalledWith('en');
  });

  it('toggle nagłówka przełącza preferencję na compact', () => {
    const { ctx, cap } = makeCtx({ state: { currentShop: { Name: 'x' }, currentTemplate: null, language: 'pl' } });
    run(ctx, '/settings');
    const menu = cap.pickers[0];
    const headerToggle = menu.items.find((i) => i.options?.some((o) => o.value === 'compact'));
    expect(headerToggle).toBeTruthy();
    expect(headerToggle.on).toBe('auto');
    headerToggle.onToggle('compact');
    expect(ctx.setHeaderPref).toHaveBeenCalledWith('compact');
  });
});

describe('/connect — routing akcji stopki', () => {
  it('„add” otwiera formularz logowania', () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/connect');
    cap.connect.onAction('add');
    expect(cap.forms).toHaveLength(1);
    expect(cap.forms[0].fields.some((f) => f.name === 'Url')).toBe(true);
  });

  it('„logout” woła ctrl.logout', () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/connect');
    cap.connect.onAction('logout');
    expect(ctx.ctrl.logout).toHaveBeenCalled();
  });

  it('„remove” otwiera picker usuwania sklepu', () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/connect');
    cap.connect.onAction('remove');
    expect(cap.pickers.some((p) => p.title === t.RemoveShopTitle)).toBe(true);
  });
});

describe('/git — menu repo vs brak repo', () => {
  it('brak repo → picker z opcją inicjalizacji', async () => {
    const { ctx, cap } = makeCtx({ ctrl: { gitStatus: vi.fn(async () => ({ available: true, isRepo: false })) } });
    run(ctx, '/git');
    await tick();
    expect(cap.pickers[0].items.some((i) => i.value === 'init')).toBe(true);
  });

  it('repo istnieje → toggle auto-commit/push + akcje historia/remote/push', async () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/git');
    await tick();
    const items = cap.pickers[0].items;
    expect(items.filter((i) => i.kind === 'toggle')).toHaveLength(2);
    expect(items.some((i) => i.value === 'history')).toBe(true);
    expect(items.some((i) => i.value === 'push')).toBe(true);
  });
});

describe('/conflicts — akcja usuwająca wymaga potwierdzenia (bezpieczeństwo)', () => {
  it('removeLocal NIE wykonuje od razu — otwiera potwierdzenie', async () => {
    const mm = [{ File: { Name: 'a', Mode: 0 }, Type: MismatchType.RemoteMissing, FileTs: '2026-01-01', LocalTs: null, RemoteTs: null }];
    const { ctx, cap } = makeCtx({ ctrl: { recheckMismatches: vi.fn(async () => mm), runCommand: vi.fn(async () => []) } });
    run(ctx, '/conflicts');
    await tick();
    const file = cap.conflicts.files[0];

    cap.conflicts.onAction('removeLocal', file);
    // potwierdzenie otwarte, komenda jeszcze NIE wykonana
    expect(cap.pickers.some((p) => p.items?.some((i) => i.value === true))).toBe(true);
    expect(ctx.ctrl.runCommand).not.toHaveBeenCalled();
  });

  it('download wykonuje od razu (bez potwierdzenia)', async () => {
    const mm = [{ File: { Name: 'a', Mode: 0 }, Type: MismatchType.LocalMissing, FileTs: null, LocalTs: null, RemoteTs: '2026-01-01' }];
    const runCommand = vi.fn(async () => []);
    const { ctx, cap } = makeCtx({ ctrl: { recheckMismatches: vi.fn(async () => mm), runCommand } });
    run(ctx, '/conflicts');
    await tick();
    cap.conflicts.onAction('download', cap.conflicts.files[0]);
    await tick();
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ comm: 'download' }));
  });
});
