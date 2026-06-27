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
});
