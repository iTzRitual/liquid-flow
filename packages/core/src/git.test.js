import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as git from './git.js';

// Testy integracyjne na PRAWDZIWYM `git` w katalogach tymczasowych. Jeśli git
// nie jest dostępny (rzadkie na maszynie dev), pomijamy całość zamiast czerwienić.
let hasGit = false;
beforeAll(async () => { hasGit = await git.isAvailable(); });

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-git-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

const write = (name, content) => fs.writeFileSync(path.join(dir, name), content);

describe.runIf(true)('git.js', () => {
  it('isAvailable wykrywa gita', async () => {
    expect(await git.isAvailable()).toBe(hasGit);
  });

  it('isRepo: false dla świeżego katalogu, true po init', async () => {
    expect(git.isRepo(dir)).toBe(false);
    write('a.liquid', 'x');
    await git.init(dir);
    expect(git.isRepo(dir)).toBe(true);
  });

  it('init robi pierwszy commit i ustawia gałąź main', async () => {
    write('a.liquid', 'x');
    const st = await git.init(dir);
    expect(st.isRepo).toBe(true);
    expect(st.commitCount).toBe(1);
    expect(st.lastCommit).not.toBeNull();
  });

  it('commitAll: zatwierdza zmiany; brak zmian → committed:false', async () => {
    write('a.liquid', 'x');
    await git.init(dir);
    expect(await git.commitAll(dir, 'noop')).toEqual({ committed: false }); // nic się nie zmieniło

    write('b.liquid', 'y');
    const r = await git.commitAll(dir, 'dodaj b');
    expect(r.committed).toBe(true);
    expect(r.hash).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('history zwraca commity od najnowszego', async () => {
    write('a.liquid', '1'); await git.init(dir);
    write('a.liquid', '2'); await git.commitAll(dir, 'zmiana 2');
    const h = await git.history(dir, 10);
    expect(h.length).toBe(2);
    expect(h[0].message).toBe('zmiana 2');     // najnowszy pierwszy
    expect(h[1].message).toBe('Initial snapshot');
    expect(h[0].hash).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('restore: przywraca pliki ze wskazanego commita i commituje', async () => {
    write('a.liquid', 'wersja-1'); await git.init(dir);
    const first = (await git.history(dir, 1))[0].hash;
    write('a.liquid', 'wersja-2'); await git.commitAll(dir, 'v2');

    await git.restore(dir, first, 'przywróć v1');
    expect(fs.readFileSync(path.join(dir, 'a.liquid'), 'utf8')).toBe('wersja-1');
    const h = await git.history(dir, 10);
    expect(h[0].message).toBe('przywróć v1');
  });

  it('setRemote/getRemote: dodaje i nadpisuje origin', async () => {
    write('a.liquid', 'x'); await git.init(dir);
    expect(await git.getRemote(dir)).toBeNull();
    await git.setRemote(dir, 'https://example.com/repo.git');
    expect(await git.getRemote(dir)).toBe('https://example.com/repo.git');
    await git.setRemote(dir, 'https://example.com/inny.git');
    expect(await git.getRemote(dir)).toBe('https://example.com/inny.git'); // nadpisany, nie zdublowany
  });

  it('push: wypycha do lokalnego bare-repo (origin)', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-bare-'));
    execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: bare });

    write('a.liquid', 'x'); await git.init(dir);
    await git.setRemote(dir, bare);
    const r = await git.push(dir);
    expect(r.branch).toBe('main');
    // commit dotarł do bare-repo
    const remoteLog = execFileSync('git', ['log', '--oneline'], { cwd: bare }).toString();
    expect(remoteLog).toContain('Initial snapshot');

    fs.rmSync(bare, { recursive: true, force: true });
  });

  it('push: niedostępny/nieprawidłowy remote → odrzuca (nie wisi)', async () => {
    write('a.liquid', 'x'); await git.init(dir);
    // remote wskazuje na pusty katalog, który NIE jest repozytorium gita →
    // push pada natychmiast (bez sieci, bez interaktywnego pytania o hasło,
    // dzięki GIT_TERMINAL_PROMPT=0), więc push() musi się odrzucić, nie zawisnąć.
    const badRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-noremote-'));
    await git.setRemote(dir, badRemote);
    await expect(git.push(dir)).rejects.toThrow();
    fs.rmSync(badRemote, { recursive: true, force: true });
  });

  it('status: pełny obraz repo (dirty/commitCount/remote)', async () => {
    write('a.liquid', 'x'); await git.init(dir);
    let st = await git.status(dir);
    expect(st).toMatchObject({ isRepo: true, dirty: false, commitCount: 1, remote: null });

    write('b.liquid', 'y'); // niezacommitowana zmiana
    st = await git.status(dir);
    expect(st.dirty).toBe(true);
  });

  it('restore/push bez repo → rzuca; status bez repo → isRepo:false', async () => {
    await expect(git.restore(dir, 'abc', 'm')).rejects.toThrow();
    await expect(git.push(dir)).rejects.toThrow();
    expect(await git.status(dir)).toMatchObject({ isRepo: false, commitCount: 0 });
  });

  it('currentBranch, listBranches, createBranch, switchBranch, countCommits', async () => {
    write('a.liquid', 'x');
    await git.init(dir);
    expect(await git.currentBranch(dir)).toBe('main');
    expect(await git.listBranches(dir)).toEqual(['main']);

    await git.createBranch(dir, 'liquidflow/wip');
    expect(await git.listBranches(dir)).toContain('liquidflow/wip');

    await git.switchBranch(dir, 'liquidflow/wip');
    expect(await git.currentBranch(dir)).toBe('liquidflow/wip');

    write('b.liquid', 'y');
    await git.commitAll(dir, 'commit 2');
    expect(await git.countCommits(dir, 'main..liquidflow/wip')).toBe(1);
  });

  it('squashMergeInto i forceBranch', async () => {
    write('a.liquid', 'x');
    await git.init(dir); // main has 1 commit
    await git.createBranch(dir, 'liquidflow/wip');
    await git.switchBranch(dir, 'liquidflow/wip');

    write('b.liquid', 'y');
    await git.commitAll(dir, 'commit on wip 1');
    write('c.liquid', 'z');
    await git.commitAll(dir, 'commit on wip 2');

    // squash merge wip into main
    const res = await git.squashMergeInto(dir, 'liquidflow/wip', 'main', 'checkpoint message');
    expect(res.committed).toBe(true);

    expect(await git.currentBranch(dir)).toBe('main');
    const hist = await git.history(dir, 10);
    expect(hist[0].message).toBe('checkpoint message');
    // hist[0] is checkpoint message, hist[1] is Initial snapshot
    expect(hist.length).toBe(2);

    // forceBranch wip back to main
    await git.forceBranch(dir, 'liquidflow/wip', 'main');
    await git.switchBranch(dir, 'liquidflow/wip');
    const wipHist = await git.history(dir, 10);
    expect(wipHist[0].message).toBe('checkpoint message');
  });

  it('dwukrotne kolejne checkpointy (brak duplikacji historii)', async () => {
    write('a.liquid', 'x');
    await git.init(dir); // main init

    await git.createBranch(dir, 'liquidflow/wip');
    await git.switchBranch(dir, 'liquidflow/wip');

    write('b.liquid', '1');
    await git.commitAll(dir, 'wip 1');
    await git.squashMergeInto(dir, 'liquidflow/wip', 'main', 'cp 1');
    await git.forceBranch(dir, 'liquidflow/wip', 'main');
    await git.switchBranch(dir, 'liquidflow/wip');

    write('b.liquid', '2');
    await git.commitAll(dir, 'wip 2');
    await git.squashMergeInto(dir, 'liquidflow/wip', 'main', 'cp 2');
    await git.forceBranch(dir, 'liquidflow/wip', 'main');

    // main history should have exactly cp 2, cp 1, Initial snapshot
    const hist = await git.history(dir, 10);
    expect(hist.map(h => h.message)).toEqual(['cp 2', 'cp 1', 'Initial snapshot']);
  });

  it('pull: pobiera zmiany i rejects na bad remote', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-bare-'));
    execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: bare });

    // repo 1
    write('a.liquid', 'x');
    await git.init(dir);
    await git.setRemote(dir, bare);
    await git.push(dir);

    // repo 2 (clone bare and modify)
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-clone2-'));
    execFileSync('git', ['clone', bare, '.'], { cwd: dir2 });
    fs.writeFileSync(path.join(dir2, 'b.liquid'), 'y');
    execFileSync('git', ['add', '-A'], { cwd: dir2 });
    execFileSync('git', ['commit', '-m', 'commit from repo 2'], { cwd: dir2 });
    execFileSync('git', ['push', 'origin', 'main'], { cwd: dir2 });

    // repo 1 pulls
    const res = await git.pull(dir);
    expect(res.branch).toBe('main');
    expect(fs.readFileSync(path.join(dir, 'b.liquid'), 'utf8')).toBe('y');

    // pull: bad remote
    const badRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-noremote-'));
    await git.setRemote(dir, badRemote);
    await expect(git.pull(dir)).rejects.toThrow();

    fs.rmSync(bare, { recursive: true, force: true });
    fs.rmSync(dir2, { recursive: true, force: true });
    fs.rmSync(badRemote, { recursive: true, force: true });
  });

  it('cloneInto: klonuje repo, nie nadpisuje niepustego katalogu, rejects na bad remote', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-bare-'));
    execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: bare });

    // seed bare repo
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-seed-'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: seedDir });
    fs.writeFileSync(path.join(seedDir, 'seed.liquid'), 'seed content');
    execFileSync('git', ['add', '-A'], { cwd: seedDir });
    execFileSync('git', ['commit', '-m', 'seed commit'], { cwd: seedDir });
    execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: seedDir });
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: seedDir });

    // clone to target
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-clone-target-'));
    const mode0Dir = path.join(targetDir, '0'); // we clone into this

    const st = await git.cloneInto(mode0Dir, bare);
    expect(st.isRepo).toBe(true);
    expect(fs.readFileSync(path.join(mode0Dir, 'seed.liquid'), 'utf8')).toBe('seed content');

    // non-empty target refusal
    await expect(git.cloneInto(mode0Dir, bare)).rejects.toThrow('Target directory is not empty');

    // bad remote
    const badTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-clone-bad-'));
    const badMode0Dir = path.join(badTargetDir, '0');
    await expect(git.cloneInto(badMode0Dir, 'https://invalid-domain-nonexistent-12345.com/repo.git')).rejects.toThrow();

    fs.rmSync(bare, { recursive: true, force: true });
    fs.rmSync(seedDir, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.rmSync(badTargetDir, { recursive: true, force: true });
  });
});

