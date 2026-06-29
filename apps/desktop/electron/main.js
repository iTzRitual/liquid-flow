// Proces główny Electrona. Ustawia katalog danych, tworzy okno + ikonę w tray,
// mostkuje IPC do kontrolera i przekazuje zdarzenia do interfejsu.

import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Katalog danych aplikacji (zanim załadujemy backend, który go odczytuje).
process.env.LIQUID_FLOW_HOME = process.env.LIQUID_FLOW_HOME || app.getPath('userData');

const DEV = process.env.LIQUID_DEV === '1';
const DEV_URL = 'http://localhost:5173';

let controller = null;
let mainWindow = null;
let tray = null;

async function getController() {
  if (!controller) {
    const { Controller } = await import('@liquidflow/core');
    controller = new Controller({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
    // przekaż zdarzenia kontrolera do renderera
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

  // linki zewnętrzne otwieraj w przeglądarce systemowej — tylko http/https
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
    /* tray opcjonalny */
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

    'sys.openFolder': () => { const d = ctrl.currentFolder(); if (d) shell.openPath(d); return d; },
    'sys.openShop': () => { const u = ctrl.currentShopUrl(); if (u) shell.openExternal(u); return u; },
    'sys.openExternal': (url) => { if (url && /^https?:\/\//.test(url)) shell.openExternal(url); },
  };

  ipcMain.handle('invoke', async (_e, method, arg) => {
    const fn = handlers[method];
    if (!fn) throw new Error('Unknown IPC method: ' + method);
    return fn(arg);
  });
}

app.whenReady().then(async () => {
  // Ścisła polityka CSP w wersji produkcyjnej (renderer rozmawia tylko przez IPC).
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
  // zostań w tray; pełne zamknięcie przez menu tray lub Cmd+Q
  if (process.platform !== 'darwin') {
    // na Windows/Linux zamykamy razem z oknem
  }
});

app.on('before-quit', () => { if (controller) controller.dispose(); });
