// DaemonClient connects to the daemon over a Unix socket / named pipe.
// It preserves the Controller interface (including synchronous getState/getMismatches/getLog)
// and provides the connectController() factory that auto-starts the daemon.

import net from 'node:net';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import * as store from '../store.js';

export class DaemonClient extends EventEmitter {
  static async connect(socketPath) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(socketPath);
      let connected = false;

      socket.on('connect', () => {
        connected = true;
        const client = new DaemonClient(socket);
        if (client.getState()) {
          resolve(client);
          return;
        }
        // snapshot is the server's first message after connecting — wait for it,
        // so getState()/getMismatches()/getLog() are ready (a drop-in for Controller).
        const done = () => resolve(client);
        client.once('state', done);
        // safeguard: if the snapshot never arrives, do not hang forever
        setTimeout(() => {
          client.removeListener('state', done);
          resolve(client);
        }, 2000).unref?.();
      });

      socket.on('error', (err) => {
        if (!connected) {
          reject(err);
        }
      });
    });
  }

  constructor(socket) {
    super();
    this._socket = socket;
    this._nextId = 1;
    this._pending = new Map();

    this._state = null;
    this._mismatches = [];
    this._git = null;
    this._log = [];

    let buffer = '';
    this._socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        this._handleMessage(line);
      }
    });

    const onClose = () => {
      for (const [, p] of this._pending) {
        p.reject(new Error('Daemon socket closed'));
      }
      this._pending.clear();
    };

    this._socket.on('close', onClose);
    this._socket.on('error', onClose);
  }

  _handleMessage(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.t === 'snapshot') {
      this._state = msg.state;
      this._log = Array.isArray(msg.log) ? msg.log : [];
      this._mismatches = Array.isArray(msg.mismatches) ? msg.mismatches : [];
      this.emit('state', this._state);
      this.emit('log:reset', this._log);
      this.emit('mismatches', this._mismatches);
    } else if (msg.t === 'event') {
      const { event, payload } = msg;
      if (event === 'state') {
        this._state = payload;
      } else if (event === 'mismatches') {
        this._mismatches = payload;
      } else if (event === 'git') {
        this._git = payload;
      } else if (event === 'log') {
        this._log.push(payload);
        if (this._log.length > 1000) {
          this._log.shift();
        }
      } else if (event === 'log:reset') {
        this._log = Array.isArray(payload) ? payload : [];
      }
      this.emit(event, payload);
    } else if (msg.t === 'result') {
      const p = this._pending.get(msg.id);
      if (p) {
        this._pending.delete(msg.id);
        if (msg.ok) {
          p.resolve(msg.value);
        } else {
          p.reject(new Error(msg.error ? msg.error.message : 'RPC error'));
        }
      }
    }
  }

  call(method, arg) {
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      const line = JSON.stringify({ t: 'call', id, method, arg }) + '\n';
      this._socket.write(line, (err) => {
        if (err) {
          this._pending.delete(id);
          reject(err);
        }
      });
    });
  }

  // --- Synchronous accessors ---
  getState() {
    return this._state;
  }

  getMismatches() {
    return this._mismatches;
  }

  getLog(sinceId = 0) {
    const minId = sinceId || 0;
    return this._log.filter((e) => e && e.Id > minId);
  }

  // --- Asynchronous wrappers around RPC methods ---
  setLanguage(id) { return this.call('lang.set', id); }
  getTranslations() { return this.call('translations.get'); }
  setUiPref(key, value) { return this.call('ui.setPref', { key, value }); }

  listShops() { return this.call('shops.list'); }
  getCurrentShop() { return this.call('shops.current'); }
  signInShop(d) { return this.call('shops.signIn', d); }
  signInSaved(id) { return this.call('shops.signInSaved', id); }
  logout() { return this.call('shops.logout'); }
  removeShop(id) { return this.call('shops.remove', id); }
  exportShops(d) { return this.call('shops.export', d); }
  importPreview(d) { return this.call('shops.importPreview', d); }
  importShops(d) { return this.call('shops.import', d); }

  listTemplates() { return this.call('templates.list'); }
  selectTemplate(id) { return this.call('templates.select', id); }
  unlockTemplate(d) { return this.call('templates.unlock', d); }
  getCurrentTemplate() { return this.call('templates.current'); }

  recheckMismatches() { return this.call('sync.recheck'); }
  runCommand(d) { return this.call('sync.command', d); }
  previewConflict(file, type) { return this.call('sync.previewConflict', { file, type }); }

  gitStatus() { return this.call('git.status'); }
  gitEnable() { return this.call('git.enable'); }
  gitSetSettings(d) { return this.call('git.settings', d); }
  gitHistory(limit) { return this.call('git.history', limit); }
  gitRestore(hash) { return this.call('git.restore', hash); }
  gitSetRemote(url) { return this.call('git.setRemote', url); }
  gitPush() { return this.call('git.push'); }
  gitCheckpoint(message, target) { return this.call('git.checkpoint', { message, target }); }
  gitUncommittedCount() { return this.call('git.uncommittedCount'); }
  gitPull() { return this.call('git.pull'); }
  gitListBranches() { return this.call('git.listBranches'); }
  gitCreateBranch(name) { return this.call('git.createBranch', name); }
  gitSwitchBranch(name, opts) { return this.call('git.switchBranch', { name, discard: !!(opts && opts.discard) }); }
  gitClone(url) { return this.call('git.clone', url); }

  currentFolder() { return this.call('sys.currentFolder'); }
  currentShopUrl() { return this.call('sys.currentShopUrl'); }
  localFilePath(file) { return this.call('sys.localFilePath', file); }

  dispose() {
    try {
      this._socket.destroy();
    } catch {}
  }
}

export async function spawnDaemon(opts = {}) {
  const daemonBinPath = fileURLToPath(new URL('../../bin/liquidflow-daemon.js', import.meta.url));
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  if (opts.insecureTLS) env.LIQUID_FLOW_INSECURE = '1';
  const child = spawn(process.execPath, [daemonBinPath], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
}

export async function connectWithRetry(socketPath, tries = 50, delayMs = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      return await DaemonClient.connect(socketPath);
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return await DaemonClient.connect(socketPath);
}

export async function connectController(opts = {}) {
  if (process.env.LIQUID_FLOW_NO_DAEMON === '1') {
    const { Controller } = await import('../controller.js');
    return new Controller(opts);
  }
  const socketPath = store.daemonSocketPath();
  try {
    return await DaemonClient.connect(socketPath);
  } catch {
    await spawnDaemon(opts);
    return await connectWithRetry(socketPath, 50, 100);
  }
}
