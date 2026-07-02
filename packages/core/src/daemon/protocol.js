// Nagłówek: Protokół komunikacji z demonem (RPC i eventy nad Unix socket / named pipe).
// Ramkowanie: Linie tekstu zakończone \n, każda to obiekt JSON.
//
// Obiekty wysyłane przez klienta:
//   { t: 'call', id: number, method: string, arg?: any }
//
// Obiekty wysyłane przez serwer:
//   { t: 'snapshot', state: object, log: Array, mismatches: Array }
//   { t: 'event', event: string, payload: any }
//   { t: 'result', id: number, ok: true, value: any }
//   { t: 'result', id: number, ok: false, error: { message: string } }

export function buildMethods(ctrl) {
  return {
    'state.get': () => ctrl.getState(),
    'translations.get': () => ctrl.getTranslations(),
    'lang.set': (id) => ctrl.setLanguage(id),
    'ui.setPref': (d) => ctrl.setUiPref(d && d.key, d && d.value),

    'shops.list': () => ctrl.listShops(),
    'shops.current': () => ctrl.getCurrentShop(),
    'shops.signIn': (d) => ctrl.signInShop(d),
    'shops.signInSaved': (id) => ctrl.signInSaved(id),
    'shops.logout': () => ctrl.logout(),
    'shops.remove': (id) => ctrl.removeShop(id),

    'templates.list': () => ctrl.listTemplates(),
    'templates.select': (id) => ctrl.selectTemplate(id),
    'templates.unlock': (d) => ctrl.unlockTemplate(d),
    'templates.current': () => ctrl.getCurrentTemplate(),

    'sync.mismatches': () => ctrl.getMismatches(),
    'sync.recheck': () => ctrl.recheckMismatches(),
    'sync.command': (d) => ctrl.runCommand(d),
    'sync.previewConflict': (d) => ctrl.previewConflict(d && d.file, d && d.type),
    'log.since': (sinceId) => ctrl.getLog(sinceId || 0),

    'git.status': () => ctrl.gitStatus(),
    'git.enable': () => ctrl.gitEnable(),
    'git.settings': (d) => ctrl.gitSetSettings(d),
    'git.history': (limit) => ctrl.gitHistory(limit),
    'git.restore': (hash) => ctrl.gitRestore(hash),
    'git.setRemote': (url) => ctrl.gitSetRemote(url),
    'git.push': () => ctrl.gitPush(),
    'git.checkpoint': (d) => ctrl.gitCheckpoint(d && d.message, d && d.target),
    'git.uncommittedCount': () => ctrl.gitUncommittedCount(),
    'git.pull': () => ctrl.gitPull(),
    'git.listBranches': () => ctrl.gitListBranches(),
    'git.createBranch': (name) => ctrl.gitCreateBranch(name),
    'git.switchBranch': (d) => ctrl.gitSwitchBranch(d && d.name, { discard: !!(d && d.discard) }),
    'git.clone': (url) => ctrl.gitClone(url),

    // Pure path/URL helpers (no shell, safe in the daemon). Shell/OS-open
    // (openFolder/openShop/openExternal) intentionally stay app-local.
    'sys.currentFolder': () => ctrl.currentFolder(),
    'sys.currentShopUrl': () => ctrl.currentShopUrl(),
    'sys.localFilePath': (file) => ctrl.localFilePath(file),
  };
}
