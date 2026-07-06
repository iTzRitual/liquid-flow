// The Electron main process. Sets up the data directory, creates the window +
// tray icon, bridges IPC to the controller, and forwards events to the UI.

import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, session, dialog } from 'electron';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultAppDir } from '@liquidflow/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// The application's data directory (before loading the backend, which reads it).
// All three apps must point at the same data directory to share a single daemon.
// app.getPath('userData') depends on the application name (different in dev vs.
// a build) and NEVER matches the CLI/MCP default directory — so we pin the
// canonical defaultAppDir() from the core. An explicit LIQUID_FLOW_HOME still
// takes precedence (tests/override).
process.env.LIQUID_FLOW_HOME = process.env.LIQUID_FLOW_HOME || defaultAppDir();

const DEV = process.env.LIQUID_DEV === '1';
const DEV_URL = 'http://localhost:5173';

let controller = null;
let mainWindow = null;
let tray = null;

async function getController() {
  if (!controller) {
    const { connectController } = await import('@liquidflow/core');
    controller = await connectController({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
    // forward controller events to the renderer
    for (const type of ['log', 'log:reset', 'mismatches', 'state', 'git', 'progress']) {
      controller.on(type, (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('event', { type, payload });
        }
      });
    }
  }
  return controller;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Liquid Flow',
    backgroundColor: '#0b0b0c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (DEV) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(ROOT, 'dist', 'renderer', 'index.html'));
  }

  // open external links in the system browser — http/https only
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray(t = {}) {
  try {
    let img = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icon.png'));
    if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip('Liquid Flow');
    const menu = Menu.buildFromTemplate([
      { label: t.ShowWindow || 'Show window', click: () => { if (!mainWindow) createWindow(); else mainWindow.show(); } },
      { type: 'separator' },
      { label: t.Quit || 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => { if (!mainWindow) createWindow(); else mainWindow.show(); });
  } catch {
    /* the tray is optional */
  }
}

// ---------- IPC ----------
function registerIpc(ctrl) {
  const handlers = {
    'state.get': () => ctrl.getState(),
    'translations.get': () => ctrl.getTranslations(),
    'lang.set': (id) => ctrl.setLanguage(id),

    'shops.list': () => ctrl.listShops(),
    'shops.current': () => ctrl.getCurrentShop(),
    'shops.signIn': (data) => ctrl.signInShop(data),
    'shops.signInSaved': (id) => ctrl.signInSaved(id),
    'shops.logout': () => ctrl.logout(),
    'shops.remove': (id) => ctrl.removeShop(id),
    'shops.export': (d) => ctrl.exportShops(d),
    'shops.importPreview': (d) => ctrl.importPreview(d),
    'shops.import': (d) => ctrl.importShops(d),
    'sys.saveExport': async ({ json, defaultName } = {}) => {
      const r = await dialog.showSaveDialog({
        defaultPath: defaultName || 'liquidflow-shops.lfshops',
        filters: [{ name: 'LiquidFlow', extensions: ['lfshops', 'json'] }],
      });
      if (r.canceled || !r.filePath) return { canceled: true };
      await fsPromises.writeFile(r.filePath, json, 'utf8');
      return { canceled: false, path: r.filePath };
    },
    'sys.readImport': async () => {
      const r = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'LiquidFlow', extensions: ['lfshops', 'json'] }],
      });
      if (r.canceled || !r.filePaths?.[0]) return { canceled: true };
      const json = await fsPromises.readFile(r.filePaths[0], 'utf8');
      return { canceled: false, json, path: r.filePaths[0] };
    },

    'templates.list': () => ctrl.listTemplates(),
    'templates.select': (tplId) => ctrl.selectTemplate(tplId),
    'templates.unlock': (data) => ctrl.unlockTemplate(data),
    'templates.current': () => ctrl.getCurrentTemplate(),

    'sync.mismatches': () => ctrl.getMismatches(),
    'sync.command': (data) => ctrl.runCommand(data),
    'sync.previewConflict': async (data) => {
      const p = await ctrl.previewConflict(data && data.file, data && data.type);
      if (p && p.kind === 'text') {
        const { buildDiffRows } = await import('@liquidflow/core');
        const added = p.diff.filter((d) => d.type === 'add').length;
        const removed = p.diff.filter((d) => d.type === 'del').length;
        return { kind: 'text', rows: buildDiffRows(p.diff, { context: 3 }), added, removed };
      }
      return p; // { kind:'binary', ... } | { kind:'tooLarge' } | null
    },
    'log.history': (sinceId) => ctrl.getLog(sinceId),

    'git.status': () => ctrl.gitStatus(),
    'git.enable': () => ctrl.gitEnable(),
    'git.settings': (data) => ctrl.gitSetSettings(data),
    'git.history': (limit) => ctrl.gitHistory(limit),
    'git.restore': (hash) => ctrl.gitRestore(hash),
    'git.setRemote': (url) => ctrl.gitSetRemote(url),
    'git.push': () => ctrl.gitPush(),
    'git.checkpoint': (data) => ctrl.gitCheckpoint(data && data.message, data && data.target),
    'git.uncommittedCount': () => ctrl.gitUncommittedCount(),
    'git.pull': () => ctrl.gitPull(),
    'git.listBranches': () => ctrl.gitListBranches(),
    'git.createBranch': (name) => ctrl.gitCreateBranch(name),
    'git.switchBranch': (data) => ctrl.gitSwitchBranch(data && data.name, { discard: !!(data && data.discard) }),

    'sys.openFolder': async () => { const d = await ctrl.currentFolder(); if (d) shell.openPath(d); return d; },
    'sys.openShop':   async () => { const u = await ctrl.currentShopUrl(); if (u) shell.openExternal(u); return u; },
    'sys.openExternal': (url) => { if (url && /^https?:\/\//.test(url)) shell.openExternal(url); },
  };

  ipcMain.handle('invoke', async (_e, method, arg) => {
    const fn = handlers[method];
    if (!fn) throw new Error('Unknown IPC method: ' + method);
    return fn(arg);
  });
}

app.whenReady().then(async () => {
  // A strict CSP policy in production (the renderer only talks over IPC).
  if (!DEV) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'",
          ],
        },
      });
    });
  }

  const ctrl = await getController();
  registerIpc(ctrl);
  createWindow();
  createTray(ctrl.getTranslations().Translations);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // stay in the tray; a full quit happens via the tray menu or Cmd+Q
  if (process.platform !== 'darwin') {
    // on Windows/Linux we quit together with the window
  }
});

app.on('before-quit', () => { if (controller) controller.dispose(); });
