// Preload — a secure bridge between the renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (method, arg) => ipcRenderer.invoke('invoke', method, arg);

contextBridge.exposeInMainWorld('api', {
  // state / language / translations
  getState: () => invoke('state.get'),
  getTranslations: () => invoke('translations.get'),
  setLanguage: (id) => invoke('lang.set', id),

  // shops
  listShops: () => invoke('shops.list'),
  currentShop: () => invoke('shops.current'),
  signInShop: (data) => invoke('shops.signIn', data),
  signInSaved: (id) => invoke('shops.signInSaved', id),
  logout: () => invoke('shops.logout'),
  removeShop: (id) => invoke('shops.remove', id),
  exportShops: (d) => invoke('shops.export', d),
  importPreview: (d) => invoke('shops.importPreview', d),
  importShops: (d) => invoke('shops.import', d),
  saveExportFile: (d) => invoke('sys.saveExport', d),
  readImportFile: () => invoke('sys.readImport'),

  // templates
  listTemplates: () => invoke('templates.list'),
  selectTemplate: (tplId) => invoke('templates.select', tplId),
  unlockTemplate: (data) => invoke('templates.unlock', data),
  currentTemplate: () => invoke('templates.current'),

  // synchronization
  getMismatches: () => invoke('sync.mismatches'),
  runCommand: (data) => invoke('sync.command', data),
  previewConflict: (data) => invoke('sync.previewConflict', data),
  getLog: (sinceId) => invoke('log.history', sinceId),

  // git
  git: {
    status: () => invoke('git.status'),
    enable: () => invoke('git.enable'),
    settings: (data) => invoke('git.settings', data),
    history: (limit) => invoke('git.history', limit),
    restore: (hash) => invoke('git.restore', hash),
    setRemote: (url) => invoke('git.setRemote', url),
    push: () => invoke('git.push'),
    checkpoint: (data) => invoke('git.checkpoint', data),
    uncommittedCount: () => invoke('git.uncommittedCount'),
    pull: () => invoke('git.pull'),
    listBranches: () => invoke('git.listBranches'),
    createBranch: (name) => invoke('git.createBranch', name),
    switchBranch: (name, opts) => invoke('git.switchBranch', { name, discard: !!(opts && opts.discard) }),
  },

  // system
  openFolder: () => invoke('sys.openFolder'),
  openShop: () => invoke('sys.openShop'),
  openExternal: (url) => invoke('sys.openExternal', url),

  // push events from the backend: { type, payload }
  onEvent: (cb) => {
    const listener = (_e, msg) => cb(msg);
    ipcRenderer.on('event', listener);
    return () => ipcRenderer.removeListener('event', listener);
  },
});
