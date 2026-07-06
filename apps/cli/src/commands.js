// Registry of CLI slash commands. Each command maps to core methods
// (@liquidflow/core Controller). buildCommands(ctx) returns a fresh list on every
// render, so the handlers always see the current state.

import fs from 'node:fs';
import { LANGUAGES, MismatchType, log, tfmt, buildDiffRows } from '@liquidflow/core';
import { openExternal } from './open.js';
import { openIdeDiff, writeRemoteTemp } from './ideDiff.js';

// Short timestamp MM-DD HH:MM (or '—' when absent).
function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function buildCommands(ctx) {
  const { ctrl, t, state, git, shops, refreshShops, clearLog, openPicker, openForm, openConflicts, openConnect, openCheckList, openDiff, openInfo, logWrap, setLogWrap, headerPref, setHeaderPref, exit, safe, skipToInput, backToInput, withLoading, dropParent } = ctx;
  const hasShop = !!state?.currentShop;
  const hasTemplate = !!state?.currentTemplate;

  // Which side is newer / where the file exists (a worded description of the conflict).
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

  // Metadata row of a conflict card: two timestamps (local = the current on-disk
  // file, remote = the version in the shop). The baseline from meta/ is technical,
  // so we do not show it — what matters is the "my version ↔ shop" comparison. The
  // worded "which is newer" description goes on a SEPARATE row (`noteLine`). No emoji
  // — U+FE0F variants are sometimes counted as 1 but drawn as 2 characters, which
  // throws off truncation and breaks the card's right border.
  const metaLine = (m) =>
    `${t.TsLocal} ${fmtTs(m.FileTs)} · ${t.TsRemote} ${fmtTs(m.RemoteTs)}`;
  const noteLine = (m) => whoNewer(m);

  // --- sign-in form (the "add new" branch / editing in /connect) ---
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

  // --- template selection ---
  // Fetches the template list and opens the picker. Assumes a signed-in shop.
  // Called inside withLoading, so the fetch time is covered by the loader.
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

  // /templates: show the loader immediately, then the list.
  const goTemplates = async () => {
    if (!await ctrl.getCurrentShop()) { log.logErr(log.tmsg('LoginFirst')); return; }
    withLoading(t.LoadingTemplates, openTemplatesPicker);
  };

  // Picker for removing a saved shop (shared: /connect → "Remove shop").
  const removeShopPicker = () => {
    if (!shops.length) { log.logInfo(log.tmsg('NoShopsToRemove')); return; }
    openPicker(t.RemoveShopTitle, shops.map((s) => ({ label: s.Name, hint: s.Url, value: s })),
      (it) => { ctrl.removeShop(it.value.Id); refreshShops(); log.logOk(log.tmsg('ShopRemoved', { name: it.value.Name })); });
  };

  // --- connecting to a shop (list + lifecycle action footer) ---
  // A list of saved shops (↑/↓, Enter = connect) + an action row in the footer
  // (←/→, also ↑/↓): Disconnect session / Add new connection / Remove shop —
  // formerly the separate /logout and /remove, folded in here since they operate on
  // this list anyway. Selecting a shop remains the fast path (one step).
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

  const exportFlow = () => {
    openCheckList({
      title: t.ShareExportTitle || 'Eksport sklepów',
      items: shops.map((s) => ({ key: String(s.Id), label: s.Name, hint: s.Url })),
      onConfirm: (sel) => {
        const ids = sel.filter((d) => d.action === 'add').map((d) => Number(d.Name));
        if (!ids.length) { log.logInfo(log.tmsg('ShareNothingSelected')); backToInput(); return; }
        openForm(t.ShareExportTitle || 'Eksport sklepów', [
          { name: 'Passphrase', label: t.SharePassphraseOptional || 'Hasło pakietu (opcjonalne)', mask: '*' },
          { name: 'Path', label: t.ShareFilePath || 'Ścieżka pliku', initial: 'liquidflow-shops.lfshops' },
        ], (vals) => withLoading(t.ShareExporting || 'Eksportowanie…', async () => {
          const res = await ctrl.exportShops({ ids, passphrase: vals.Passphrase });
          fs.writeFileSync(vals.Path, res.json);
          log.logOk(log.tmsg('ShareExportedTo', { count: res.count, path: vals.Path }));
          // withLoading does NOT return to the input on success (it holds the frame
          // until fn opens a view) — here we open nothing, so we return explicitly.
          backToInput();
        }));
      },
    });
  };

  const importFlow = () => {
    openForm(t.ShareImportTitle || 'Import sklepów', [
      { name: 'Path', label: t.ShareFilePath || 'Ścieżka pliku' },
      { name: 'Passphrase', label: t.SharePassphraseOptional || 'Hasło pakietu (opcjonalne)', mask: '*' },
    ], (vals) => withLoading(t.ShareImporting || 'Importowanie…', async () => {
      // withLoading does not return to the input on success — every path that does
      // not open a further view must call backToInput() explicitly (otherwise the
      // loader spins forever).
      let json;
      try { json = fs.readFileSync(vals.Path, 'utf8'); }
      catch { log.logErr(log.tmsg('ShareFileReadFailed', { path: vals.Path })); backToInput(); return; }
      let preview;
      try { preview = await ctrl.importPreview({ json, passphrase: vals.Passphrase }); }
      catch (e) { log.logErr(e.message); backToInput(); return; }
      openCheckList({
        title: t.ShareImportTitle || 'Import sklepów',
        items: preview.shops.map((s) => ({
          key: s.Name, label: s.Name, hint: s.Url, conflict: s.exists,
        })),
        onConfirm: (selections) => withLoading(t.ShareImporting || 'Importowanie…', async () => {
          const res = await ctrl.importShops({ json, passphrase: vals.Passphrase, selections });
          refreshShops();
          log.logOk(log.tmsg('ShareImportedResult', res));
          backToInput();
        }),
      });
    }));
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
    if (shops.length) actions.push({ key: 'export', label: t.ShareExport || 'Export shops' });
    actions.push({ key: 'import', label: t.ShareImport || 'Import shops' });
    if (shops.length) actions.push({ key: 'remove', label: t.RemoveShopTitle });
    openConnect({
      title: t.ConnectToShop,
      shops: shopItems,
      actions,
      onShop: connectToShop,
      onAction: (key) => {
        if (key === 'add') { loginForm(); return; }
        if (key === 'logout') { backToInput(); ctrl.logout(); return; }
        if (key === 'export') { exportFlow(); return; }
        if (key === 'import') { importFlow(); return; }
        if (key === 'remove') { removeShopPicker(); return; }
      },
      onSlash: skipToInput,
    });
  };

  // --- settings (language + log wrapping + header) ---
  // Settings menu: inline toggles — log wrapping, header (Auto/Compact) and
  // language (←/→ without a submenu). Header: 'auto' = native degradation (full logo
  // when it fits), 'compact' = always 1 row.
  const headerModes = [
    { label: t.HeaderModeAuto, value: 'auto' },
    { label: t.HeaderModeCompact, value: 'compact' },
  ];
  const settingsMenu = () => openPicker(t.Settings, [
    { kind: 'toggle', label: t.SettingsWrap, on: !!logWrap, onToggle: (v) => { setLogWrap(v); log.logInfo(log.tmsg(v ? 'LogWrapOn' : 'LogWrapOff')); } },
    { kind: 'toggle', label: t.SettingsHeader, options: headerModes, on: headerPref || 'auto', onToggle: (v) => { setHeaderPref(v); log.logInfo(log.tmsg('HeaderModeSet', { name: headerModes.find((m) => m.value === v)?.label || v })); } },
    { kind: 'toggle', label: t.Language, options: LANGUAGES.map((l) => ({ label: l.Name, value: l.Id })), on: state?.language || 'pl', onToggle: (v) => { const lang = LANGUAGES.find((l) => l.Id === v); ctrl.setLanguage(v); log.logInfo(log.tmsg('LanguageSet', { name: lang?.Name || v })); } },
  ]);

  // --- conflicts ---
  // A single conflict-resolution screen. Each file is a row with actions matched to
  // the conflict type, toggled with ←/→ directly in the row (no submenu) — Enter
  // runs the chosen one. Bulk operations at the end of the list. Entry via the
  // conflict indicator in the header → /conflicts.

  // Two sensible actions for a given conflict type + a default choice (never a
  // deletion). For Timestamp, the default direction comes from the newer side.
  const fileOptions = (m) => {
    if (m.Type === MismatchType.LocalMissing) {
      // only on the server → download or delete on the shop
      return { options: [
        { label: t.ActionDownloadShort, value: 'download' },
        { label: t.ActionDeleteRemoteShort, value: 'removeRemote' },
        { label: t.ActionPreviewShort, value: 'preview' },
      ], initial: 2 };
    }
    if (m.Type === MismatchType.RemoteMissing) {
      // only locally → upload or delete locally
      return { options: [
        { label: t.ActionUploadShort, value: 'upload' },
        { label: t.ActionDeleteLocalShort, value: 'removeLocal' },
        { label: t.ActionPreviewShort, value: 'preview' },
      ], initial: 2 };
    }
    // Timestamp: both exist → download from the server or upload from local
    return { options: [
      { label: t.ActionDownloadShort, value: 'download' },
      { label: t.ActionUploadShort, value: 'upload' },
      { label: t.ActionPreviewShort, value: 'preview' },
    ], initial: 2 };
  };

  // A confirmation that on "No" returns to the conflict list (we stay in the flow).
  const confirmStay = (title, onYes, mm) =>
    openPicker(title, [
      { label: t.ConfirmYes, value: true },
      { label: t.ConfirmNo, value: false },
    ], (it) => { if (it.value) onYes(); else renderConflicts(mm); });

  // Opens a conflict preview as a diff in an external IDE (`code --diff`, or another
  // editor via LIQUIDFLOW_DIFF_CMD): the left side is the REAL local path (editing in
  // the IDE saves there, so the watcher/git see the change), the right side is the
  // remote version written to a temporary file (for reference only).
  const openInIde = async (m, preview) => {
    if (preview?.kind !== 'text' && preview?.kind !== 'tooLarge') return;
    const localPath = await ctrl.localFilePath(m.File);
    const remotePath = writeRemoteTemp(m.File.Name, preview.remote);
    openIdeDiff(localPath, remotePath, (cmd, err) => {
      log.logErr(log.tmsg('IdeDiffFailed', { cmd, error: err.message }));
    });
    log.logInfo(log.tmsg('OpeningIdeDiff', { name: m.File.Name }));
  };

  // Run an action on a file: a loader during the SOAP call, then refresh the list
  // and keep it open (you resolve the next conflict without re-entering /conflicts).
  const runFileAction = (m, value, mm) => {
    if (value === 'preview') {
      withLoading(t.PreviewLoading, async () => {
        const preview = await ctrl.previewConflict(m.File, m.Type);
        // Two overlay heights: `lines` = collapsed view (context folded, small for a
        // large file with a small change) and `fullLines` = expanded view (all rows,
        // after Tab). The overlay grows to `fullLines` once expanded (see
        // naturalBodyRows), so Tab ACTUALLY enlarges the window instead of squeezing
        // the content into one row. For binary/tooLarge both = 1 (a fixed box).
        const isText = preview?.kind === 'text';
        const lines = isText ? buildDiffRows(preview.diff, { context: 3 }).length : 1;
        const fullLines = isText ? buildDiffRows(preview.diff, { context: 3, fold: false }).length : 1;
        const canOpenIde = isText || preview?.kind === 'tooLarge';
        openDiff({
          title: tfmt(t.DiffTitle, { name: m.File.Name }),
          preview, lines, fullLines, expanded: false,
          onOpenIde: canOpenIde ? () => openInIde(m, preview) : undefined,
          // Lets App.jsx detect in the background (via the periodic conflict poll)
          // that the VIEWED file is no longer a conflict (e.g. the watcher uploaded
          // it after an IDE save) — it then returns to the conflict list on its own,
          // or, if it was the last one, to the main screen (see App.jsx).
          watchMismatch: { fileMode: m.File.Mode, name: m.File.Name },
        });
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

  // A bulk operation (all) with a list refresh on completion.
  const runBulk = (comm) => withLoading(t.ApplyingAction, async () => {
    const fresh = await ctrl.runCommand({ comm });
    renderConflicts(fresh);
  });

  // Render the conflict screen from the PASSED (fresh) mm list — not from the ctx
  // snapshot, because we recompute conflicts live before opening (see showConflicts).
  // Each file = a card (name + buttons / metadata / spacing); at the bottom a footer
  // with bulk operations.
  const renderConflicts = (mm) => {
    // Instead of a log flash (visible for a fraction of a second — it looks like a
    // popup that vanishes at once), show this on a separate screen for a few seconds,
    // dismissible by any key. The log also gets an entry (persistent history).
    if (!mm.length) {
      log.logOk(log.tmsg('NoConflicts'));
      openInfo({ title: t.FileConflicts, message: t.NoConflicts, duration: 4000 });
      return;
    }

    // how many files each bulk operation covers (the same filters as in syncEngine)
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

  // Entering /conflicts: first recompute conflicts live (the same request as the
  // periodic poll — it catches fresh shop-side changes), then show the list. This
  // way download/upload decisions are based on the current state.
  const showConflicts = () => {
    if (!hasTemplate) { log.logErr(log.tmsg('NoActiveTemplateHint')); return; }
    withLoading(t.CheckingMismatch, async () => {
      const mm = await ctrl.recheckMismatches();
      renderConflicts(mm);
    });
  };

  // --- git ---
  const gitMenu = () => safe(async () => {
    // `/git` is a top-level menu (always entered from the input). Re-opens after an
    // action (e.g. returning from a branch-switch confirmation) go through the picker
    // wrappers, which set `pendingParentRef` to the source screen — without this Esc
    // would return to the stale confirmation instead of the input. We clear the parent
    // here, so the refreshed git menu always sends Esc back to the main screen.
    dropParent();
    if (!hasTemplate) { log.logErr(log.tmsg('NoActiveTemplateHint')); return; }
    const st = await ctrl.gitStatus();
    if (!st.available) { log.logErr(log.tmsg('GitNotInstalled')); return; }

    const confirmGit = (title, onYes) =>
      openPicker(title, [
        { label: t.ConfirmYes, value: true },
        { label: t.ConfirmNo, value: false },
      ], (it) => { if (it.value) onYes(); else gitMenu(); });

    // No repository → the only option is to initialize or clone.
    if (!st.isRepo) {
      openPicker(t.GitMenuNoRepo, [
        { label: t.GitInitRepo, value: 'init' },
        { label: t.GitCloneRepo, value: 'clone' },
      ], (it) => {
        if (it.value === 'init') {
          withLoading(t.Loading, async () => {
            await ctrl.gitEnable();
            gitMenu(); // the refreshed git menu clears the parent itself (Esc → input)
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

    // The repository exists → all items directly (no nesting).
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
          // choose the target stream (branch), defaulting to the current one; + new branch
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
                  // uncommitted versions on the current stream → confirm discarding
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

  // --- command definitions ---
  const commands = [
    { name: '/connect', desc: t.CmdConnect, run: () => connect() },
    { name: '/templates', desc: t.CmdTemplates, run: () => goTemplates() },
    { name: '/conflicts', desc: t.CmdConflicts, run: () => showConflicts() },
    { name: '/git', desc: t.CmdGit, run: () => gitMenu() },
    { name: '/open', desc: t.CmdOpen, run: async () => { const d = await ctrl.currentFolder(); if (d) { openExternal(d); log.logInfo(log.tmsg('Opening', { path: d })); } else log.logErr(log.tmsg('NoActiveTemplate')); } },
    { name: '/clear', desc: t.CmdClear, run: () => clearLog() },
    { name: '/settings', desc: t.CmdSettings, run: () => settingsMenu() },
    { name: '/exit(quit)', desc: t.CmdExit, run: () => exit() },
  ];

  // Attached to the array (does not change the returned value's shape — the tests
  // and App.jsx still treat `commands` as a list), so App.jsx can refresh the
  // /conflicts screen from the outside (see the auto-navigation effect after an IDE save).
  commands.renderConflicts = renderConflicts;
  return commands;
}
