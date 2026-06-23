// Rejestr slash-komend CLI. Każda komenda mapuje na metody rdzenia
// (@liquidflow/core Controller). buildCommands(ctx) zwraca świeżą listę przy
// każdym renderze, dzięki czemu handlery widzą aktualny stan.

import { LANGUAGES, MismatchType, log } from '@liquidflow/core';
import { openExternal } from './open.js';

const MISMATCH_LABEL = {
  [MismatchType.Timestamp]: 'zmienione po obu stronach',
  [MismatchType.LocalMissing]: 'tylko zdalnie (brak lokalnie)',
  [MismatchType.RemoteMissing]: 'tylko lokalnie (brak zdalnie)',
};

export function buildCommands(ctx) {
  const { ctrl, state, mismatches, git, shops, refreshShops, clearLog, openPicker, openForm, exit, safe, skipToInput, withLoading } = ctx;
  const hasShop = !!state?.currentShop;
  const hasTemplate = !!state?.currentTemplate;

  // --- formularz logowania (współdzielony przez /login i /shops) ---
  const loginForm = (prefill = {}) =>
    openForm('Zaloguj sklep', [
      { name: 'Name', label: 'Nazwa (A-Za-z0-9)', initial: prefill.Name || '' },
      { name: 'Url', label: 'URL', initial: prefill.Url || 'https://' },
      { name: 'Password', label: 'Hasło webmastera', mask: '*' },
      { name: 'Save', label: 'Zapisz hasło?', type: 'choice', initial: true, options: [{ label: 'Tak', value: true }, { label: 'Nie', value: false }] },
    ], (vals) => withLoading('Łączenie ze sklepem…', async () => {
      await ctrl.signInShop({ Name: vals.Name, Url: vals.Url, Password: vals.Password, SavePassword: !!vals.Save });
      refreshShops();
      await openTemplatesPicker();
    }));

  // --- wybór szablonu ---
  // Pobiera listę szablonów i otwiera picker. Zakłada zalogowany sklep.
  // Wywoływane wewnątrz withLoading, więc czas pobierania pokrywa loader.
  const openTemplatesPicker = async () => {
    const tpls = await ctrl.listTemplates();
    openPicker('Wybierz szablon', tpls.map((t) => ({
      label: `${t.Name} [${t.Id}]`,
      hint: t.Locked ? '🔒 zablokowany' : '',
      value: t,
    })), (item) => safe(async () => {
      const r = await ctrl.selectTemplate(item.value.Id);
      if (r.Locked) {
        openForm(`Odblokuj „${r.Name}”`, [{ name: 'Password', label: 'Hasło szablonu', mask: '*' }],
          (vals) => safe(() => ctrl.unlockTemplate({ tplId: r.Id, Password: vals.Password, SavePassword: true })));
      }
    }));
  };

  // /templates: od razu pokaż loader, potem listę.
  const goTemplates = () => {
    if (!ctrl.getCurrentShop()) { log.logErr('Najpierw zaloguj sklep: /login'); return; }
    withLoading('Ładowanie szablonów…', openTemplatesPicker);
  };

  // --- łączenie ze sklepem (lista + dodanie nowego) ---
  const connect = () => {
    const items = shops.map((s) => ({
      label: s.Name,
      hint: s.isCurrent ? '● bieżący' : s.Url,
      value: { kind: 'shop', shop: s },
    }));
    items.push({ label: '＋ Dodaj nowe połączenie (dodaj sklep)', value: { kind: 'add' } });
    openPicker('Połącz ze sklepem', items, (it) => {
      const v = it.value;
      if (v.kind === 'add') { loginForm(); return; }
      const s = v.shop;
      if (s.SavePassword) {
        withLoading('Łączenie ze sklepem…', async () => {
          await ctrl.signInSaved(s.Id);
          refreshShops();
          await openTemplatesPicker();
        });
      } else {
        loginForm({ Name: s.Name, Url: s.Url });
      }
    }, { onSlash: skipToInput });
  };

  // --- konflikty ---
  const showConflicts = () => {
    if (!hasTemplate) { log.logErr('Brak aktywnego szablonu: /templates'); return; }
    if (!mismatches.length) { log.logOk('Brak konfliktów — wszystko zsynchronizowane ✓'); return; }
    openPicker('Konflikty plików', mismatches.map((m) => ({
      label: `${m.File.Name}`,
      hint: MISMATCH_LABEL[m.Type] || m.Type,
      value: m,
    })), (item) => {
      const m = item.value;
      const actions = [];
      if (m.Type !== MismatchType.RemoteMissing) actions.push({ label: '↓ Pobierz (zdalna → lokalna)', value: 'download' });
      if (m.Type !== MismatchType.LocalMissing) actions.push({ label: '↑ Wyślij (lokalna → sklep)', value: 'upload' });
      actions.push({ label: '🗑 Usuń lokalnie', value: 'removeLocal' });
      actions.push({ label: '🗑 Usuń w sklepie', value: 'removeRemote' });
      openPicker(`Akcja: ${m.File.Name}`, actions,
        (a) => safe(() => ctrl.runCommand({ comm: a.value, file: m.File, type: m.Type })));
    });
  };

  // --- git ---
  const gitMenu = () => safe(async () => {
    if (!hasTemplate) { log.logErr('Brak aktywnego szablonu: /templates'); return; }
    const st = await ctrl.gitStatus();
    if (!st.available) { log.logErr('Git nie jest zainstalowany w systemie'); return; }

    // Brak repozytorium → jedyna opcja to inicjalizacja. Po niej wracamy do
    // pełnego menu (a nie do ekranu głównego).
    if (!st.isRepo) {
      openPicker('Git / Backup — nie wykryto repozytorium', [
        { label: 'Zainicjalizuj repozytorium', value: 'init' },
      ], () => safe(async () => {
        await ctrl.gitEnable();
        gitMenu();
      }));
      return;
    }

    // Repozytorium istnieje → wszystkie pozycje wprost (bez zagnieżdżania).
    const title = `Git / Backup — wykryto repozytorium (${st.commitCount} commit(ów)${st.remote ? ', remote ustawiony' : ''})`;
    const items = [
      { kind: 'toggle', label: 'Auto-commit', on: !!st.autoCommit, onToggle: (v) => safe(() => ctrl.gitSetSettings({ autoCommit: v })) },
      { kind: 'toggle', label: 'Auto-push', on: !!st.autoPush, onToggle: (v) => safe(() => ctrl.gitSetSettings({ autoPush: v })) },
      { label: 'Historia / przywróć wersję', value: 'history' },
      { label: 'Ustaw zdalne repozytorium (remote)', value: 'remote' },
      { label: 'Push do origin', value: 'push' },
    ];
    openPicker(title, items, (it) => safe(async () => {
      switch (it.value) {
        case 'push': await ctrl.gitPush(); break;
        case 'remote':
          openForm('Zdalne repozytorium', [{ name: 'url', label: 'URL (git@… lub https://…)' }],
            (v) => safe(() => ctrl.gitSetRemote(v.url)));
          break;
        case 'history': {
          const hist = await ctrl.gitHistory(50);
          if (!hist.length) { log.logInfo('Brak historii (jeszcze nic nie zapisano)'); break; }
          openPicker('Historia — wybierz, by przywrócić', hist.map((h) => ({
            label: `${h.hash} ${h.message || ''}`.trim(),
            hint: h.relative || '',
            value: h,
          })), (h) => safe(() => ctrl.gitRestore(h.value.hash)));
          break;
        }
      }
    }));
  });

  // --- definicje komend ---
  const commands = [
    { name: '/connect', desc: 'połącz ze sklepem (lista)', run: () => connect() },
    { name: '/login', desc: 'zaloguj / dodaj sklep', run: () => loginForm() },
    { name: '/shops', desc: 'przełącz sklep', run: () => {
        if (!shops.length) { log.logInfo('Brak zapisanych sklepów — użyj /login'); return; }
        openPicker('Twoje sklepy', shops.map((s) => ({
          label: s.Name,
          hint: s.isCurrent ? '● bieżący' : s.Url,
          value: s,
        })), (it) => {
          const s = it.value;
          if (s.SavePassword) {
            // auto-login zapisanym hasłem, bez ponownego wpisywania
            withLoading('Łączenie ze sklepem…', async () => {
              await ctrl.signInSaved(s.Id);
              refreshShops();
              await openTemplatesPicker();
            });
          } else {
            loginForm({ Name: s.Name, Url: s.Url });
          }
        });
      } },
    { name: '/templates', desc: 'wybierz szablon', run: () => goTemplates() },
    { name: '/files', desc: 'konflikty i akcje', run: () => showConflicts() },
    { name: '/download-all', desc: 'pobierz wszystkie różnice', run: () => safe(() => ctrl.runCommand({ comm: 'downloadAll' })) },
    { name: '/upload-all', desc: 'wyślij wszystkie różnice', run: () => safe(() => ctrl.runCommand({ comm: 'uploadAll' })) },
    { name: '/refresh', desc: 'przelicz konflikty', run: () => safe(() => ctrl.runCommand({ comm: 'refresh' })) },
    { name: '/git', desc: 'wersjonowanie i backup', run: () => gitMenu() },
    { name: '/open', desc: 'otwórz folder lokalny', run: () => { const d = ctrl.currentFolder(); if (d) { openExternal(d); log.logInfo('Otwieram: ' + d); } else log.logErr('Brak aktywnego szablonu'); } },
    { name: '/lang', desc: 'zmień język', run: () => openPicker('Język', LANGUAGES.map((l) => ({ label: l.Name, value: l })), (it) => { ctrl.setLanguage(it.value.Id); log.logInfo('Język: ' + it.value.Name); }) },
    { name: '/logout', desc: 'rozłącz (wyloguj)', run: () => {
        if (!hasShop) { log.logInfo('Nie jesteś połączony z żadnym sklepem'); return; }
        ctrl.logout();
      } },
    { name: '/remove', desc: 'usuń sklep', run: () => {
        if (!shops.length) { log.logInfo('Brak sklepów do usunięcia'); return; }
        openPicker('Usuń sklep', shops.map((s) => ({ label: s.Name, hint: s.Url, value: s })),
          (it) => { ctrl.removeShop(it.value.Id); refreshShops(); log.logOk('Usunięto sklep: ' + it.value.Name); });
      } },
    { name: '/clear', desc: 'wyczyść panel logu', run: () => clearLog() },
    { name: '/exit(quit)', desc: 'zakończ', run: () => exit() },
  ];

  return commands;
}
