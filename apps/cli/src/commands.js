// Rejestr slash-komend CLI. Każda komenda mapuje na metody rdzenia
// (@liquidflow/core Controller). buildCommands(ctx) zwraca świeżą listę przy
// każdym renderze, dzięki czemu handlery widzą aktualny stan.

import { LANGUAGES, MismatchType, log, tfmt, buildDiffRows } from '@liquidflow/core';
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
  const { ctrl, t, state, git, shops, refreshShops, clearLog, openPicker, openForm, openConflicts, openConnect, openDiff, logWrap, setLogWrap, headerPref, setHeaderPref, exit, safe, skipToInput, backToInput, withLoading, dropParent } = ctx;
  const hasShop = !!state?.currentShop;
  const hasTemplate = !!state?.currentTemplate;

  // Która strona jest nowsza / gdzie istnieje plik (słowny opis konfliktu).
  const whoNewer = (m) => {
    if (m.Type === MismatchType.LocalMissing) return t.HintRemoteOnly;
    if (m.Type === MismatchType.RemoteMissing) return t.HintLocalOnly;
    const f = new Date(m.FileTs).getTime();
    const r = new Date(m.RemoteTs).getTime();
    if (!Number.isNaN(f) && !Number.isNaN(r)) {
      if (f > r) return t.HintLocalNewer;
      if (r > f) return t.HintRemoteNewer;
    }
    return t.HintBothChanged;
  };

  // Wiersz metadanych karty konfliktu: dwa znaczniki czasu (lokalny = aktualny
  // plik na dysku, zdalny = wersja w sklepie). Baseline z meta/ jest techniczny,
  // więc go nie pokazujemy — liczy się porównanie „moja wersja ↔ sklep". Słowny
  // opis „która nowsza” idzie OSOBNYM wierszem (`noteLine`). Bez emoji —
  // warianty U+FE0F bywają liczone jako 1, a rysowane jako 2 znaki, co rozjeżdża
  // przycinanie i łamie prawą ramkę karty.
  const metaLine = (m) =>
    `${t.TsLocal} ${fmtTs(m.FileTs)} · ${t.TsRemote} ${fmtTs(m.RemoteTs)}`;
  const noteLine = (m) => whoNewer(m);

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

  // Picker usuwania zapisanego sklepu (współdzielony: /connect → „Usuń sklep”).
  const removeShopPicker = () => {
    if (!shops.length) { log.logInfo(log.tmsg('NoShopsToRemove')); return; }
    openPicker(t.RemoveShopTitle, shops.map((s) => ({ label: s.Name, hint: s.Url, value: s })),
      (it) => { ctrl.removeShop(it.value.Id); refreshShops(); log.logOk(log.tmsg('ShopRemoved', { name: it.value.Name })); });
  };

  // --- łączenie ze sklepem (lista + stopka akcji cyklu życia) ---
  // Lista zapisanych sklepów (↑/↓, Enter = połącz) + wiersz akcji w stopce
  // (←/→, też ↑/↓): Rozłącz sesję / Dodaj nowe połączenie / Usuń sklep —
  // wcześniej osobne /logout i /remove, zwinięte tutaj, bo i tak operują na tej
  // liście. Wybór sklepu zostaje szybką ścieżką (jeden krok).
  const connectToShop = (s) => {
    if (s.SavePassword) {
      withLoading(t.ConnectingToShop, async () => {
        await ctrl.signInSaved(s.Id);
        refreshShops();
        await openTemplatesPicker();
      });
    } else {
      loginForm({ Name: s.Name, Url: s.Url });
    }
  };

  const connect = () => {
    const shopItems = shops.map((s) => ({
      label: s.Name,
      hint: s.isCurrent ? t.CurrentShop : s.Url,
      shop: s,
    }));
    const actions = [];
    if (hasShop) actions.push({ key: 'logout', label: t.DisconnectSession });
    actions.push({ key: 'add', label: t.AddConnectionShort });
    if (shops.length) actions.push({ key: 'remove', label: t.RemoveShopTitle });
    openConnect({
      title: t.ConnectToShop,
      shops: shopItems,
      actions,
      onShop: connectToShop,
      onAction: (key) => {
        if (key === 'add') { loginForm(); return; }
        if (key === 'logout') { backToInput(); ctrl.logout(); return; }
        if (key === 'remove') { removeShopPicker(); return; }
      },
      onSlash: skipToInput,
    });
  };

  // --- ustawienia (język + zawijanie logów + nagłówek) ---
  // Menu ustawień: inline toggle — zawijanie logów, nagłówek (Auto/Zwinięty) i
  // język (←/→ bez podmenu). Nagłówek: 'auto' = natywna degradacja (pełne logo gdy
  // się mieści), 'compact' = zawsze 1 wiersz.
  const headerModes = [
    { label: t.HeaderModeAuto, value: 'auto' },
    { label: t.HeaderModeCompact, value: 'compact' },
  ];
  const settingsMenu = () => openPicker(t.Settings, [
    { kind: 'toggle', label: t.SettingsWrap, on: !!logWrap, onToggle: (v) => { setLogWrap(v); log.logInfo(log.tmsg(v ? 'LogWrapOn' : 'LogWrapOff')); } },
    { kind: 'toggle', label: t.SettingsHeader, options: headerModes, on: headerPref || 'auto', onToggle: (v) => { setHeaderPref(v); log.logInfo(log.tmsg('HeaderModeSet', { name: headerModes.find((m) => m.value === v)?.label || v })); } },
    { kind: 'toggle', label: t.Language, options: LANGUAGES.map((l) => ({ label: l.Name, value: l.Id })), on: state?.language || 'pl', onToggle: (v) => { const lang = LANGUAGES.find((l) => l.Id === v); ctrl.setLanguage(v); log.logInfo(log.tmsg('LanguageSet', { name: lang?.Name || v })); } },
  ]);

  // --- konflikty ---
  // Jeden ekran rozwiązywania konfliktów. Każdy plik to wiersz z DWIEMA akcjami
  // dopasowanymi do typu konfliktu, przełączanymi ←/→ wprost w wierszu (bez
  // podmenu) — Enter wykonuje wybraną. Na końcu listy operacje seryjne. Wejście
  // przez wskaźnik konfliktów w nagłówku → /conflicts.

  // Dwie sensowne akcje dla danego typu konfliktu + domyślny wybór (nigdy nie
  // jest nim usuwanie). Dla Timestamp domyślnie kierunek od nowszej strony.
  const fileOptions = (m) => {
    if (m.Type === MismatchType.LocalMissing) {
      // tylko na serwerze → pobierz albo usuń w sklepie
      return { options: [
        { label: t.ActionDownloadShort, value: 'download' },
        { label: t.ActionDeleteRemoteShort, value: 'removeRemote' },
        { label: t.ActionPreviewShort, value: 'preview' },
      ], initial: 2 };
    }
    if (m.Type === MismatchType.RemoteMissing) {
      // tylko lokalnie → wyślij albo usuń lokalnie
      return { options: [
        { label: t.ActionUploadShort, value: 'upload' },
        { label: t.ActionDeleteLocalShort, value: 'removeLocal' },
        { label: t.ActionPreviewShort, value: 'preview' },
      ], initial: 2 };
    }
    // Timestamp: oba istnieją → pobierz z serwera albo wyślij z lokala
    return { options: [
      { label: t.ActionDownloadShort, value: 'download' },
      { label: t.ActionUploadShort, value: 'upload' },
      { label: t.ActionPreviewShort, value: 'preview' },
    ], initial: 2 };
  };

  // Potwierdzenie, które przy „Nie” wraca do listy konfliktów (zostajemy w flow).
  const confirmStay = (title, onYes, mm) =>
    openPicker(title, [
      { label: t.ConfirmYes, value: true },
      { label: t.ConfirmNo, value: false },
    ], (it) => { if (it.value) onYes(); else renderConflicts(mm); });

  // Wykonanie akcji na pliku: loader na czas SOAP, potem odśwież listę i zostaw
  // ją otwartą (kolejny konflikt rozwiązujesz bez ponownego /conflicts).
  const runFileAction = (m, value, mm) => {
    if (value === 'preview') {
      withLoading(t.PreviewLoading, async () => {
        const preview = await ctrl.previewConflict(m.File, m.Type);
        // Dwie wysokości nakładki: `lines` = widok zwinięty (kontekst zwinięty, mały
        // dla dużego pliku z małą zmianą) i `fullLines` = widok rozwinięty (wszystkie
        // wiersze, po Tab). Nakładka rośnie do `fullLines` po rozwinięciu (patrz
        // naturalBodyRows), więc Tab REALNIE powiększa okno zamiast wciskać treść w
        // jeden wiersz. Dla binary/tooLarge obie = 1 (stały box).
        const isText = preview?.kind === 'text';
        const lines = isText ? buildDiffRows(preview.diff, { context: 3 }).length : 1;
        const fullLines = isText ? buildDiffRows(preview.diff, { context: 3, fold: false }).length : 1;
        openDiff({ title: tfmt(t.DiffTitle, { name: m.File.Name }), preview, lines, fullLines, expanded: false });
      });
      return;
    }
    const exec = () => withLoading(t.ApplyingAction, async () => {
      const fresh = await ctrl.runCommand({ comm: value, file: m.File, type: m.Type });
      renderConflicts(fresh);
    });
    if (value === 'removeLocal') { confirmStay(tfmt(t.ConfirmRemoveLocalFile, { name: m.File.Name }), exec, mm); return; }
    if (value === 'removeRemote') { confirmStay(tfmt(t.ConfirmRemoveRemoteFile, { name: m.File.Name }), exec, mm); return; }
    exec();
  };

  // Operacja seryjna (wszystkie) z odświeżeniem listy po zakończeniu.
  const runBulk = (comm) => withLoading(t.ApplyingAction, async () => {
    const fresh = await ctrl.runCommand({ comm });
    renderConflicts(fresh);
  });

  // Render ekranu konfliktów z PRZEKAZANEJ (świeżej) listy mm — nie z migawki ctx,
  // bo przed otwarciem przeliczamy konflikty na żywo (patrz showConflicts).
  // Każdy plik = karta (nazwa + przyciski / metadane / odstęp); na dole stopka
  // z operacjami seryjnymi.
  const renderConflicts = (mm) => {
    if (!mm.length) { log.logOk(log.tmsg('NoConflicts')); backToInput(); return; }

    // ile plików obejmie każda operacja seryjna (te same filtry co w syncEngine)
    const nDownload = mm.filter((m) => m.Type === MismatchType.LocalMissing || m.Type === MismatchType.Timestamp).length;
    const nUpload = mm.filter((m) => m.Type === MismatchType.RemoteMissing || m.Type === MismatchType.Timestamp).length;

    const files = mm.map((m) => {
      const { options, initial } = fileOptions(m);
      return { name: m.File.Name, meta: metaLine(m), note: noteLine(m), options, initial, m };
    });

    const bulk = [];
    if (nDownload) bulk.push({ label: tfmt(t.DownloadAllN, { count: nDownload }), value: 'downloadAll' });
    if (nUpload) bulk.push({ label: tfmt(t.UploadAllN, { count: nUpload }), value: 'uploadAll' });

    openConflicts({
      title: t.FileConflicts,
      files,
      bulk,
      onAction: (value, file) => runFileAction(file.m, value, mm),
      onBulk: (value) => {
        if (value === 'downloadAll') { confirmStay(tfmt(t.ConfirmDownloadAll, { count: nDownload }), () => runBulk('downloadAll'), mm); return; }
        if (value === 'uploadAll') { confirmStay(tfmt(t.ConfirmUploadAll, { count: nUpload }), () => runBulk('uploadAll'), mm); }
      },
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
    // `/git` to menu najwyższego poziomu (zawsze wchodzone z inputu). Re‑otwarcia
    // po akcji (np. powrót z potwierdzenia przełączenia gałęzi) idą przez wrappery
    // pickera, które ustawiają `pendingParentRef` na ekran‑źródło — bez tego Esc
    // wracałby do nieaktualnego potwierdzenia zamiast do inputu. Czyścimy rodzica
    // tu, więc odświeżone menu git zawsze cofa Esc do ekranu głównego.
    dropParent();
    if (!hasTemplate) { log.logErr(log.tmsg('NoActiveTemplateHint')); return; }
    const st = await ctrl.gitStatus();
    if (!st.available) { log.logErr(log.tmsg('GitNotInstalled')); return; }

    const confirmGit = (title, onYes) =>
      openPicker(title, [
        { label: t.ConfirmYes, value: true },
        { label: t.ConfirmNo, value: false },
      ], (it) => { if (it.value) onYes(); else gitMenu(); });

    // Brak repozytorium → jedyna opcja to inicjalizacja lub sklonowanie.
    if (!st.isRepo) {
      openPicker(t.GitMenuNoRepo, [
        { label: t.GitInitRepo, value: 'init' },
        { label: t.GitCloneRepo, value: 'clone' },
      ], (it) => {
        if (it.value === 'init') {
          withLoading(t.Loading, async () => {
            await ctrl.gitEnable();
            gitMenu(); // odświeżone menu git samo czyści rodzica (Esc → input)
          }, t.GitInitRepo);
        } else if (it.value === 'clone') {
          openForm(t.GitCloneTitle, [{ name: 'url', label: t.GitRemoteUrlField }],
            (v) => confirmGit(t.ConfirmClone, () => {
              withLoading(t.GitCloning, async () => {
                await ctrl.gitClone(v.url);
                gitMenu();
              });
            })
          );
        }
      });
      return;
    }

    // Repozytorium istnieje → wszystkie pozycje wprost (bez zagnieżdżania).
    const title = tfmt(t.GitMenuRepoTitle, { branch: st.branch || '—', count: st.commitCount, remote: st.remote ? t.GitRemoteSetSuffix : '' });
    const items = [
      { kind: 'toggle', label: t.AutoCommit, on: !!st.autoCommit, onToggle: (v) => safe(() => ctrl.gitSetSettings({ autoCommit: v })) },
      { kind: 'toggle', label: t.AutoPush, on: !!st.autoPush, onToggle: (v) => safe(() => ctrl.gitSetSettings({ autoPush: v })) },
      { label: t.GitCheckpoint, value: 'checkpoint' },
      { label: t.GitPull, value: 'pull' },
      { label: t.GitBranches, value: 'branches' },
      { label: t.GitHistoryRestore, value: 'history' },
      { label: t.GitSetRemote, value: 'remote' },
      { label: t.GitPushToOrigin, value: 'push' },
    ];
    openPicker(title, items, (it) => safe(async () => {
      switch (it.value) {
        case 'checkpoint': {
          // wybór strumienia docelowego (gałąź), domyślnie bieżący; + nowa gałąź
          const branches = await ctrl.gitListBranches();
          const cur = st.branch;
          const targetItems = [
            ...branches.map((b) => ({ label: b === cur ? b + t.GitCurrentSuffix : b, value: b })),
            { label: t.GitCheckpointNewBranch, value: '__new__' },
          ];
          const runCheckpoint = (target) => openForm(t.GitCheckpointTitle,
            [{ name: 'message', label: t.GitCheckpointMessageField }],
            (v) => confirmGit(tfmt(t.ConfirmCheckpoint, { branch: target }), () => {
              withLoading(t.GitCheckpointing, async () => {
                await ctrl.gitCheckpoint(v.message, target);
                gitMenu();
              });
            }));
          openPicker(t.GitCheckpointTargetTitle, targetItems, (tIt) => safe(async () => {
            if (tIt.value === '__new__') {
              openForm(t.GitBranchCreateTitle, [{ name: 'name', label: t.GitBranchNameField }],
                (v) => runCheckpoint(v.name));
            } else {
              runCheckpoint(tIt.value);
            }
          }));
          break;
        }
        case 'pull':
          confirmGit(t.ConfirmPull, () => {
            withLoading(t.GitPulling, async () => {
              await ctrl.gitPull();
              gitMenu();
            });
          });
          break;
        case 'branches':
          openPicker(t.GitBranchesTitle, [
            { label: t.GitBranchCreate, value: 'create' },
            { label: t.GitBranchSwitch, value: 'switch' },
          ], (subIt) => safe(async () => {
            if (subIt.value === 'create') {
              openForm(t.GitBranchCreateTitle, [{ name: 'name', label: t.GitBranchNameField }],
                (v) => safe(async () => {
                  await ctrl.gitCreateBranch(v.name);
                  gitMenu();
                })
              );
            } else if (subIt.value === 'switch') {
              const list = await ctrl.gitListBranches();
              openPicker(t.GitBranchSwitchTitle, list.map(b => ({ label: b, value: b })),
                (bIt) => safe(async () => {
                  const ahead = await ctrl.gitUncommittedCount();
                  const doSwitch = (discard) => withLoading(t.GitSwitching, async () => {
                    await ctrl.gitSwitchBranch(bIt.value, { discard });
                    gitMenu();
                  });
                  // niezatwierdzone wersje na bieżącym strumieniu → potwierdź porzucenie
                  if (ahead > 0) {
                    confirmGit(tfmt(t.GitSwitchDiscardConfirm, { count: ahead, name: bIt.value }), () => doSwitch(true));
                  } else {
                    confirmGit(tfmt(t.ConfirmSwitchBranch, { name: bIt.value }), () => doSwitch(false));
                  }
                })
              );
            }
          }));
          break;
        case 'push':
          confirmGit(t.ConfirmPush, () => {
            withLoading(t.Loading, async () => {
              await ctrl.gitPush();
              gitMenu();
            });
          });
          break;
        case 'remote':
          openForm(t.GitRemoteTitle, [{ name: 'url', label: t.GitRemoteUrlField, initial: st.remote || '' }],
            (v) => safe(() => ctrl.gitSetRemote(v.url)));
          break;
        case 'history': {
          const hist = await ctrl.gitHistory(50);
          if (!hist.length) { log.logInfo(log.tmsg('GitNoHistory')); break; }
          openPicker(t.GitHistoryPick, hist.map((h) => ({
            label: `${h.hash} ${h.message || ''}`.trim(),
            hint: h.relative || '',
            value: h,
          })), (h) => confirmGit(tfmt(t.ConfirmGitRestore, { hash: h.value.hash }), () => {
            withLoading(t.Loading, async () => {
              await ctrl.gitRestore(h.value.hash);
              gitMenu();
            });
          }));
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
    { name: '/clear', desc: t.CmdClear, run: () => clearLog() },
    { name: '/settings', desc: t.CmdSettings, run: () => settingsMenu() },
    { name: '/exit(quit)', desc: t.CmdExit, run: () => exit() },
  ];

  return commands;
}
