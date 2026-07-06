import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { translationsFor, MismatchType } from '@liquidflow/core';
import { buildCommands } from './commands.js';

const t = translationsFor('pl');
const tick = () => new Promise((r) => setTimeout(r, 0));

// A flexible ctx: captures ALL opens (pickers/forms/connect/conflicts) into
// arrays, while the execution helpers (safe/withLoading) fire immediately.
function makeCtx(overrides = {}) {
  const cap = { pickers: [], forms: [], connect: null, conflicts: null, diff: null, checklists: [] };
  const { ctrl: ctrlOverrides, ...otherOverrides } = overrides;
  const ctx = {
    ctrl: {
      getCurrentShop: () => ({ Name: 'x' }),
      listTemplates: vi.fn(async () => [{ Id: 5, Name: 'Topaz', Locked: false }]),
      recheckMismatches: vi.fn(async () => []),
      runCommand: vi.fn(async () => []),
      gitStatus: vi.fn(async () => ({ available: true, isRepo: true, branch: 'main', ahead: 0, commitCount: 2, autoCommit: false, autoPush: false, remote: null })),
      gitListBranches: vi.fn(async () => ['main']),
      gitUncommittedCount: vi.fn(async () => 0),
      setLanguage: vi.fn(),
      logout: vi.fn(),
      removeShop: vi.fn(),
      currentFolder: () => null,
      ...ctrlOverrides,
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
    openCheckList: vi.fn((payload) => { cap.checklists.push(payload); }),
    openDiff: vi.fn((payload) => { cap.diff = payload; }),
    openInfo: vi.fn((payload) => { cap.info = payload; }),
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
    ...otherOverrides,
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
  it('brak repo → picker z opcją inicjalizacji i klonowania', async () => {
    const { ctx, cap } = makeCtx({ ctrl: { gitStatus: vi.fn(async () => ({ available: true, isRepo: false })) } });
    run(ctx, '/git');
    await tick();
    const items = cap.pickers[0].items;
    expect(items.some((i) => i.value === 'init')).toBe(true);
    expect(items.some((i) => i.value === 'clone')).toBe(true);
  });

  it('repo istnieje → toggle auto-commit/push + akcje checkpoint/pull/branches/historia/remote/push', async () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/git');
    await tick();
    const items = cap.pickers[0].items;
    expect(items.filter((i) => i.kind === 'toggle')).toHaveLength(2);
    expect(items.some((i) => i.value === 'checkpoint')).toBe(true);
    expect(items.some((i) => i.value === 'pull')).toBe(true);
    expect(items.some((i) => i.value === 'branches')).toBe(true);
    expect(items.some((i) => i.value === 'history')).toBe(true);
    expect(items.some((i) => i.value === 'push')).toBe(true);
  });

  it('wybór clone (gdy brak repo) otwiera formularz, potem potwierdzenie, a potem woła gitClone', async () => {
    const gitClone = vi.fn(async () => ({}));
    const { ctx, cap } = makeCtx({
      ctrl: {
        gitStatus: vi.fn(async () => ({ available: true, isRepo: false })),
        gitClone
      }
    });
    run(ctx, '/git');
    await tick();
    
    cap.pickers[0].onSelect({ value: 'clone' });
    await tick();
    
    expect(cap.forms).toHaveLength(1);
    expect(cap.forms[0].fields[0].name).toBe('url');
    
    cap.forms[0].onSubmit({ url: 'https://github.com/test/repo.git' });
    await tick();
    
    const confirmPicker = cap.pickers[cap.pickers.length - 1];
    expect(confirmPicker.items.some(i => i.value === true)).toBe(true);
    
    confirmPicker.onSelect({ value: true });
    await tick();
    
    expect(gitClone).toHaveBeenCalledWith('https://github.com/test/repo.git');
  });

  it('wybór checkpoint: picker strumienia → form → potwierdzenie → gitCheckpoint(msg, target)', async () => {
    const gitCheckpoint = vi.fn(async () => ({}));
    const { ctx, cap } = makeCtx({ ctrl: { gitCheckpoint, gitListBranches: vi.fn(async () => ['main', 'release']) } });
    run(ctx, '/git');
    await tick();

    cap.pickers[0].onSelect({ value: 'checkpoint' });
    await tick();

    // first choose the target stream (branches + new branch)
    const targetPicker = cap.pickers[cap.pickers.length - 1];
    expect(targetPicker.items.map(i => i.value)).toEqual(['main', 'release', '__new__']);

    targetPicker.onSelect({ value: 'release' });
    await tick();

    expect(cap.forms[cap.forms.length - 1].fields[0].name).toBe('message');
    cap.forms[cap.forms.length - 1].onSubmit({ message: 'Z1' });
    await tick();

    const confirmPicker = cap.pickers[cap.pickers.length - 1];
    confirmPicker.onSelect({ value: true });
    await tick();

    expect(gitCheckpoint).toHaveBeenCalledWith('Z1', 'release');
  });

  it('checkpoint na nową gałąź: pyta o nazwę przed message i woła gitCheckpoint z nową nazwą', async () => {
    const gitCheckpoint = vi.fn(async () => ({}));
    const { ctx, cap } = makeCtx({ ctrl: { gitCheckpoint } });
    run(ctx, '/git');
    await tick();

    cap.pickers[0].onSelect({ value: 'checkpoint' });
    await tick();
    cap.pickers[cap.pickers.length - 1].onSelect({ value: '__new__' });
    await tick();

    // the new-branch-name form
    expect(cap.forms[cap.forms.length - 1].fields[0].name).toBe('name');
    cap.forms[cap.forms.length - 1].onSubmit({ name: 'feature-x' });
    await tick();

    // the message form
    cap.forms[cap.forms.length - 1].onSubmit({ message: 'Z2' });
    await tick();

    cap.pickers[cap.pickers.length - 1].onSelect({ value: true });
    await tick();

    expect(gitCheckpoint).toHaveBeenCalledWith('Z2', 'feature-x');
  });

  it('wybór pull otwiera potwierdzenie, potem woła gitPull', async () => {
    const gitPull = vi.fn(async () => ({}));
    const { ctx, cap } = makeCtx({ ctrl: { gitPull } });
    run(ctx, '/git');
    await tick();
    
    cap.pickers[0].onSelect({ value: 'pull' });
    await tick();
    
    const confirmPicker = cap.pickers[cap.pickers.length - 1];
    confirmPicker.onSelect({ value: true });
    await tick();
    
    expect(gitPull).toHaveBeenCalled();
  });

  it('switch branch (bez niezatwierdzonych) → potwierdzenie i gitSwitchBranch(name, {discard:false})', async () => {
    const gitListBranches = vi.fn(async () => ['main', 'release']);
    const gitSwitchBranch = vi.fn(async () => ({}));
    const gitUncommittedCount = vi.fn(async () => 0);
    const { ctx, cap } = makeCtx({ ctrl: { gitListBranches, gitSwitchBranch, gitUncommittedCount } });
    run(ctx, '/git');
    await tick();

    cap.pickers[0].onSelect({ value: 'branches' });
    await tick();

    const branchesPicker = cap.pickers[cap.pickers.length - 1];
    expect(branchesPicker.items.some(i => i.value === 'switch')).toBe(true);

    branchesPicker.onSelect({ value: 'switch' });
    await tick();

    const switchPicker = cap.pickers[cap.pickers.length - 1];
    expect(switchPicker.items.map(i => i.value)).toEqual(['main', 'release']);

    switchPicker.onSelect({ value: 'release' });
    await tick();

    cap.pickers[cap.pickers.length - 1].onSelect({ value: true });
    await tick();

    expect(gitSwitchBranch).toHaveBeenCalledWith('release', { discard: false });
  });

  it('switch branch z niezatwierdzonymi wersjami → confirm porzucenia i gitSwitchBranch z discard:true', async () => {
    const gitSwitchBranch = vi.fn(async () => ({}));
    const gitUncommittedCount = vi.fn(async () => 3);
    const { ctx, cap } = makeCtx({ ctrl: {
      gitListBranches: vi.fn(async () => ['main', 'release']),
      gitSwitchBranch, gitUncommittedCount,
    } });
    run(ctx, '/git');
    await tick();

    cap.pickers[0].onSelect({ value: 'branches' });
    await tick();
    cap.pickers[cap.pickers.length - 1].onSelect({ value: 'switch' });
    await tick();
    cap.pickers[cap.pickers.length - 1].onSelect({ value: 'release' });
    await tick();

    cap.pickers[cap.pickers.length - 1].onSelect({ value: true });
    await tick();

    expect(gitSwitchBranch).toHaveBeenCalledWith('release', { discard: true });
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
    // confirmation open, the command has NOT run yet
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

// Regression: `withLoading` does NOT return to the input on success by itself —
// it holds the frame until `fn` opens the next view. Export/import paths that end
// without opening a view (save success, read error, no selection) MUST explicitly
// call backToInput(), otherwise the loader spins forever (this was a bug).
describe('udostępnianie sklepów (export/import) — powrót do inputu', () => {
  it('export: po zapisie pliku wraca do inputu', async () => {
    const exportShops = vi.fn(async () => ({ json: '{"ok":1}', count: 1, encrypted: false }));
    const { ctx, cap } = makeCtx({ ctrl: { exportShops } });
    run(ctx, '/connect');
    cap.connect.onAction('export');
    expect(cap.checklists).toHaveLength(1);
    cap.checklists[0].onConfirm([{ Name: '1', action: 'add' }]); // the selected shop has Id=1
    const form = cap.forms.at(-1);
    const tmp = path.join(os.tmpdir(), `lf-export-test-${Date.now()}.lfshops`);
    await form.onSubmit({ Passphrase: '', Path: tmp });
    await tick();
    expect(exportShops).toHaveBeenCalledWith(expect.objectContaining({ ids: [1] }));
    expect(fs.readFileSync(tmp, 'utf8')).toContain('ok');
    expect(ctx.backToInput).toHaveBeenCalled();
    fs.rmSync(tmp, { force: true });
  });

  it('export: brak zaznaczonych → wraca do inputu, nie otwiera formularza', () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/connect');
    cap.connect.onAction('export');
    cap.checklists[0].onConfirm([]); // nothing selected
    expect(cap.forms).toHaveLength(0);
    expect(ctx.backToInput).toHaveBeenCalled();
  });

  it('import: błąd odczytu pliku wraca do inputu', async () => {
    const { ctx, cap } = makeCtx();
    run(ctx, '/connect');
    cap.connect.onAction('import');
    const form = cap.forms.at(-1);
    await form.onSubmit({ Path: path.join(os.tmpdir(), 'lf-nope-does-not-exist.lfshops'), Passphrase: '' });
    await tick();
    expect(ctx.backToInput).toHaveBeenCalled();
  });

  it('import: po zaimportowaniu wybranych wraca do inputu', async () => {
    const importPreview = vi.fn(async () => ({ encrypted: false, shops: [{ Name: 'Nowy', Url: 'https://n.pl', hasPassword: false, exists: false }] }));
    const importShops = vi.fn(async () => ({ added: 1, updated: 0, skipped: 0 }));
    const { ctx, cap } = makeCtx({ ctrl: { importPreview, importShops } });
    const tmp = path.join(os.tmpdir(), `lf-import-test-${Date.now()}.lfshops`);
    fs.writeFileSync(tmp, '{"app":"LiquidFlow"}');
    run(ctx, '/connect');
    cap.connect.onAction('import');
    const form = cap.forms.at(-1);
    await form.onSubmit({ Path: tmp, Passphrase: '' });
    await tick();
    expect(cap.checklists).toHaveLength(1); // the preview opened the selection list
    cap.checklists.at(-1).onConfirm([{ Name: 'Nowy', action: 'add' }]);
    await tick();
    expect(importShops).toHaveBeenCalled();
    expect(ctx.backToInput).toHaveBeenCalled();
    fs.rmSync(tmp, { force: true });
  });
});
