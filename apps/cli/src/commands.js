// Rejestr slash-komend CLI. Każda komenda mapuje na metody rdzenia
// (@liquidflow/core Controller). buildCommands(ctx) zwraca świeżą listę przy
// każdym renderze, dzięki czemu handlery widzą aktualny stan.

import { LANGUAGES, MismatchType, log, tfmt } from '@liquidflow/core';
import { openExternal } from './open.js';

// Krótki znacznik czasu MM-DD HH:MM (lub '—' gdy brak).
function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function buildCommands(ctx) {
  const { ctrl, t, state, git, shops, refreshShops, clearLog, openPicker, openForm, logWrap, setLogWrap, exit, safe, skipToInput, backToInput, withLoading } = ctx;
  const hasShop = !!state?.currentShop;
  const hasTemplate = !!state?.currentTemplate;

  // Podpowiedź w liście konfliktów: co zrobić + który nowszy (na podstawie
  // czasu pliku na dysku vs czasu po stronie sklepu).
  const conflictHint = (m) => {
    if (m.Type === MismatchType.LocalMissing) return t.HintRemoteOnly;
    if (m.Type === MismatchType.RemoteMissing) return t.HintLocalOnly;
    const f = new Date(m.FileTs).getTime();
    const r = new Date(m.RemoteTs).getTime();
    let who = t.HintBothChanged;
    if (!Number.isNaN(f) && !Number.isNaN(r)) {
      if (f > r) who = t.HintLocalNewer;
      else if (r > f) who = t.HintRemoteNewer;
    }
    return `${who}  (${t.TsLocalShort} ${fmtTs(m.FileTs)} · ${t.TsRemoteShort} ${fmtTs(m.RemoteTs)})`;
  };

  // Potwierdzenie tak/nie przed operacją nieodwracalną (styl picker).
  const confirm = (title, onYes) =>
    openPicker(title, [
      { label: t.ConfirmYes, value: true },
      { label: t.ConfirmNo, value: false },
    ], (it) => { if (it.value) onYes(); });

  // --- formularz logowania (gałąź „dodaj nowy” / edycja w /connect) ---
  const loginForm = (prefill = {}) =>
    openForm(t.SignInShopTitle, [
      { name: 'Name', label: t.FieldName, initial: prefill.Name || '' },
      { name: 'Url', label: 'URL', initial: prefill.Url || 'https://' },
      { name: 'Password', label: t.FieldWebmasterPassword, mask: '*' },
      { name: 'Save', label: t.FieldSavePasswordQ, type: 'choice', initial: true, options: [{ label: t.Yes, value: true }, { label: t.No, value: false }] },
    ], (vals) => withLoading(t.ConnectingToShop, async () => {
      await ctrl.signInShop({ Name: vals.Name, Url: vals.Url, Password: vals.Password, SavePassword: !!vals.Save });
      refreshShops();
      await openTemplatesPicker();
    }));

  // --- wybór szablonu ---
  // Pobiera listę szablonów i otwiera picker. Zakłada zalogowany sklep.
  // Wywoływane wewnątrz withLoading, więc czas pobierania pokrywa loader.
  const openTemplatesPicker = async () => {
    const tpls = await ctrl.listTemplates();
    openPicker(t.SelectTemplate, tpls.map((tpl) => ({
      label: `${tpl.Name} [${tpl.Id}]`,
      hint: tpl.Locked ? t.LockedHint : '',
      value: tpl,
    })), (item) => safe(async () => {
      const r = await ctrl.selectTemplate(item.value.Id);
      if (r.Locked) {
        openForm(tfmt(t.UnlockTitle, { name: r.Name }), [{ name: 'Password', label: t.TemplatePassword, mask: '*' }],
          (vals) => safe(() => ctrl.unlockTemplate({ tplId: r.Id, Password: vals.Password, SavePassword: true })));
      }
    }));
  };

  // /templates: od razu pokaż loader, potem listę.
  const goTemplates = () => {
    if (!ctrl.getCurrentShop()) { log.logErr(log.tmsg('LoginFirst')); return; }
    withLoading(t.LoadingTemplates, openTemplatesPicker);
  };

  // --- łączenie ze sklepem (lista + dodanie nowego) ---
  const connect = () => {
    const items = shops.map((s) => ({
      label: s.Name,
      hint: s.isCurrent ? t.CurrentShop : s.Url,
      value: { kind: 'shop', shop: s },
    }));
    items.push({ label: t.AddNewConnection, value: { kind: 'add' } });
    openPicker(t.ConnectToShop, items, (it) => {
      const v = it.value;
      if (v.kind === 'add') { loginForm(); return; }
      const s = v.shop;
      if (s.SavePassword) {
        withLoading(t.ConnectingToShop, async () => {
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
  // Jeden ekran do rozwiązywania konfliktów: pojedyncze pliki (pobierz/wyślij/
  // usuń) + na końcu operacje seryjne („wszystkie”) z potwierdzeniem. Wejście
  // przez wskaźnik konfliktów w nagłówku → /conflicts.
  // Render listy konfliktów z PRZEKAZANEJ (świeżej) listy mm — nie z migawki ctx,
  // bo przed otwarciem przeliczamy konflikty na żywo (patrz showConflicts).
  const renderConflicts = (mm) => {
    if (!mm.length) { log.logOk(log.tmsg('NoConflicts')); backToInput(); return; }

    // ile plików obejmie każda operacja seryjna (te same filtry co w syncEngine)
    const nDownload = mm.filter((m) => m.Type === MismatchType.LocalMissing || m.Type === MismatchType.Timestamp).length;
    const nUpload = mm.filter((m) => m.Type === MismatchType.RemoteMissing || m.Type === MismatchType.Timestamp).length;

    const items = mm.map((m) => ({
      label: `${m.File.Name}`,
      hint: conflictHint(m),
      value: { kind: 'file', m },
    }));
    // pozycje seryjne na końcu listy (jak „przyciski”)
    if (nDownload) items.push({ label: tfmt(t.DownloadAllN, { count: nDownload }), hint: t.RemoteToLocal, value: { kind: 'downloadAll' } });
    if (nUpload) items.push({ label: tfmt(t.UploadAllN, { count: nUpload }), hint: t.LocalToShop, value: { kind: 'uploadAll' } });

    openPicker(t.FileConflicts, items, (item) => {
      const v = item.value;
      if (v.kind === 'downloadAll') {
        confirm(tfmt(t.ConfirmDownloadAll, { count: nDownload }),
          () => safe(() => ctrl.runCommand({ comm: 'downloadAll' })));
        return;
      }
      if (v.kind === 'uploadAll') {
        confirm(tfmt(t.ConfirmUploadAll, { count: nUpload }),
          () => safe(() => ctrl.runCommand({ comm: 'uploadAll' })));
        return;
      }
      const m = v.m;
      const actions = [];
      if (m.Type !== MismatchType.RemoteMissing) actions.push({ label: t.ActionDownload, value: 'download' });
      if (m.Type !== MismatchType.LocalMissing) actions.push({ label: t.ActionUpload, value: 'upload' });
      actions.push({ label: t.ActionRemoveLocal, value: 'removeLocal' });
      actions.push({ label: t.ActionRemoveRemote, value: 'removeRemote' });
      // tytuł: trzy znaczniki czasu jak w desktopie — użytkownik sam decyduje
      const tsLine = `📄 ${t.TsFile} ${fmtTs(m.FileTs)}   💾 ${t.TsLocal} ${fmtTs(m.LocalTs)}   ☁️ ${t.TsRemote} ${fmtTs(m.RemoteTs)}`;
      openPicker(`${tfmt(t.ActionTitle, { name: m.File.Name })}\n${tsLine}`, actions,
        (a) => safe(() => ctrl.runCommand({ comm: a.value, file: m.File, type: m.Type })));
    });
  };

  // Wejście w /conflicts: najpierw przelicz konflikty na żywo (to samo zapytanie
  // co cykliczny poll — wyłapuje świeże zmiany po stronie sklepu), potem pokaż
  // listę. Dzięki temu decyzje pobierz/wyślij opierają się na aktualnym stanie.
  const showConflicts = () => {
    if (!hasTemplate) { log.logErr(log.tmsg('NoActiveTemplateHint')); return; }
    withLoading(t.CheckingMismatch, async () => {
      const mm = await ctrl.recheckMismatches();
      renderConflicts(mm);
    });
  };

  // --- git ---
  const gitMenu = () => safe(async () => {
    if (!hasTemplate) { log.logErr(log.tmsg('NoActiveTemplateHint')); return; }
    const st = await ctrl.gitStatus();
    if (!st.available) { log.logErr(log.tmsg('GitNotInstalled')); return; }

    // Brak repozytorium → jedyna opcja to inicjalizacja. Po niej wracamy do
    // pełnego menu (a nie do ekranu głównego).
    if (!st.isRepo) {
      openPicker(t.GitMenuNoRepo, [
        { label: t.GitInitRepo, value: 'init' },
      ], () => safe(async () => {
        await ctrl.gitEnable();
        gitMenu();
      }));
      return;
    }

    // Repozytorium istnieje → wszystkie pozycje wprost (bez zagnieżdżania).
    const title = tfmt(t.GitMenuRepoTitle, { count: st.commitCount, remote: st.remote ? t.GitRemoteSetSuffix : '' });
    const items = [
      { kind: 'toggle', label: 'Auto-commit', on: !!st.autoCommit, onToggle: (v) => safe(() => ctrl.gitSetSettings({ autoCommit: v })) },
      { kind: 'toggle', label: 'Auto-push', on: !!st.autoPush, onToggle: (v) => safe(() => ctrl.gitSetSettings({ autoPush: v })) },
      { label: t.GitHistoryRestore, value: 'history' },
      { label: t.GitSetRemote, value: 'remote' },
      { label: t.GitPushToOrigin, value: 'push' },
    ];
    openPicker(title, items, (it) => safe(async () => {
      switch (it.value) {
        case 'push': await ctrl.gitPush(); break;
        case 'remote':
          openForm(t.GitRemoteTitle, [{ name: 'url', label: t.GitRemoteUrlField }],
            (v) => safe(() => ctrl.gitSetRemote(v.url)));
          break;
        case 'history': {
          const hist = await ctrl.gitHistory(50);
          if (!hist.length) { log.logInfo(log.tmsg('GitNoHistory')); break; }
          openPicker(t.GitHistoryPick, hist.map((h) => ({
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
    { name: '/connect', desc: t.CmdConnect, run: () => connect() },
    { name: '/templates', desc: t.CmdTemplates, run: () => goTemplates() },
    { name: '/conflicts', desc: t.CmdConflicts, run: () => showConflicts() },
    { name: '/git', desc: t.CmdGit, run: () => gitMenu() },
    { name: '/open', desc: t.CmdOpen, run: () => { const d = ctrl.currentFolder(); if (d) { openExternal(d); log.logInfo(log.tmsg('Opening', { path: d })); } else log.logErr(log.tmsg('NoActiveTemplate')); } },
    { name: '/lang', desc: t.CmdLang, run: () => openPicker(t.Language, LANGUAGES.map((l) => ({ label: l.Name, value: l })), (it) => { ctrl.setLanguage(it.value.Id); log.logInfo(log.tmsg('LanguageSet', { name: it.value.Name })); }) },
    { name: '/logout', desc: t.CmdLogout, run: () => {
        if (!hasShop) { log.logInfo(log.tmsg('NotConnectedAny')); return; }
        ctrl.logout();
      } },
    { name: '/remove', desc: t.CmdRemove, run: () => {
        if (!shops.length) { log.logInfo(log.tmsg('NoShopsToRemove')); return; }
        openPicker(t.RemoveShopTitle, shops.map((s) => ({ label: s.Name, hint: s.Url, value: s })),
          (it) => { ctrl.removeShop(it.value.Id); refreshShops(); log.logOk(log.tmsg('ShopRemoved', { name: it.value.Name })); });
      } },
    { name: '/wrap', desc: t.CmdWrap, run: () => {
        const nv = !logWrap;
        setLogWrap(nv);
        log.logInfo(log.tmsg(nv ? 'LogWrapOn' : 'LogWrapOff'));
      } },
    { name: '/clear', desc: t.CmdClear, run: () => clearLog() },
    { name: '/exit(quit)', desc: t.CmdExit, run: () => exit() },
  ];

  return commands;
}
