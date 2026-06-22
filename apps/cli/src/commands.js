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
  const { ctrl, state, mismatches, git, shops, refreshShops, clearLog, openPicker, openForm, exit, safe } = ctx;
  const hasShop = !!state?.currentShop;
  const hasTemplate = !!state?.currentTemplate;

  // --- formularz logowania (współdzielony przez /login i /shops) ---
  const loginForm = (prefill = {}) =>
    openForm('Zaloguj sklep', [
      { name: 'Name', label: 'Nazwa (A-Za-z0-9)', initial: prefill.Name || '' },
      { name: 'Url', label: 'URL (https://… lub http://localhost:port)', initial: prefill.Url || '' },
      { name: 'Password', label: 'Hasło webmastera', mask: '*' },
    ], (vals) => safe(async () => {
      await ctrl.signInShop({ ...vals, SavePassword: true });
      refreshShops();
      await listTemplates();
    }));

  // --- wybór szablonu ---
  const listTemplates = () => safe(async () => {
    if (!ctrl.getCurrentShop()) { log.logErr('Najpierw zaloguj sklep: /login'); return; }
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
  });

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
    const items = [];
    if (!st.active || !st.autoCommit) items.push({ label: 'Włącz wersjonowanie (auto-commit)', value: 'enable' });
    items.push({ label: `Auto-commit: ${st.autoCommit ? 'WYŁĄCZ' : 'WŁĄCZ'}`, value: 'toggleCommit' });
    items.push({ label: `Auto-push: ${st.autoPush ? 'WYŁĄCZ' : 'WŁĄCZ'}`, value: 'togglePush' });
    items.push({ label: 'Historia / przywróć wersję', value: 'history' });
    items.push({ label: 'Ustaw zdalne repozytorium (remote)', value: 'remote' });
    items.push({ label: 'Push do origin', value: 'push' });
    openPicker('Git / Backup', items, (it) => safe(async () => {
      switch (it.value) {
        case 'enable': await ctrl.gitEnable(); break;
        case 'toggleCommit': await ctrl.gitSetSettings({ autoCommit: !st.autoCommit }); break;
        case 'togglePush': await ctrl.gitSetSettings({ autoPush: !st.autoPush }); break;
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
    { name: '/help', desc: 'lista komend', run: () => openPicker('Komendy', commands.filter((c) => c.name !== '/help').map((c) => ({ label: c.name, hint: c.desc, value: c })), (it) => it.value.run()) },
    { name: '/login', desc: 'zaloguj / dodaj sklep', run: () => loginForm() },
    { name: '/shops', desc: 'przełącz sklep', run: () => {
        if (!shops.length) { log.logInfo('Brak zapisanych sklepów — użyj /login'); return; }
        openPicker('Twoje sklepy', shops.map((s) => ({ label: s.Name, hint: s.isCurrent ? '● bieżący' : s.Url, value: s })),
          (it) => loginForm({ Name: it.value.Name, Url: it.value.Url }));
      } },
    { name: '/templates', desc: 'wybierz szablon', run: () => listTemplates() },
    { name: '/files', desc: 'konflikty i akcje', run: () => showConflicts() },
    { name: '/download-all', desc: 'pobierz wszystkie różnice', run: () => safe(() => ctrl.runCommand({ comm: 'downloadAll' })) },
    { name: '/upload-all', desc: 'wyślij wszystkie różnice', run: () => safe(() => ctrl.runCommand({ comm: 'uploadAll' })) },
    { name: '/refresh', desc: 'przelicz konflikty', run: () => safe(() => ctrl.runCommand({ comm: 'refresh' })) },
    { name: '/git', desc: 'wersjonowanie i backup', run: () => gitMenu() },
    { name: '/open', desc: 'otwórz folder lokalny', run: () => { const d = ctrl.currentFolder(); if (d) { openExternal(d); log.logInfo('Otwieram: ' + d); } else log.logErr('Brak aktywnego szablonu'); } },
    { name: '/lang', desc: 'zmień język', run: () => openPicker('Język', LANGUAGES.map((l) => ({ label: l.Name, value: l })), (it) => { ctrl.setLanguage(it.value.Id); log.logInfo('Język: ' + it.value.Name); }) },
    { name: '/remove', desc: 'usuń sklep', run: () => {
        if (!shops.length) { log.logInfo('Brak sklepów do usunięcia'); return; }
        openPicker('Usuń sklep', shops.map((s) => ({ label: s.Name, hint: s.Url, value: s })),
          (it) => { ctrl.removeShop(it.value.Id); refreshShops(); log.logOk('Usunięto sklep: ' + it.value.Name); });
      } },
    { name: '/clear', desc: 'wyczyść panel logu', run: () => clearLog() },
    { name: '/status', desc: 'szczegóły bieżącej sesji', run: () => {
        const s = state || {};
        log.logInfo(`Sklep: ${s.currentShop ? s.currentShop.Name + ' (' + s.currentShop.Url + ')' : 'brak'} · Szablon: ${s.currentTemplate ? s.currentTemplate.Name + ' [' + s.currentTemplate.Id + ']' : 'brak'} · Konflikty: ${mismatches.length}`);
      } },
    { name: '/exit', desc: 'zakończ', run: () => exit() },
    { name: '/quit', desc: 'zakończ', run: () => exit() },
  ];

  return commands;
}
