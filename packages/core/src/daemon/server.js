import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { buildMethods } from './protocol.js';

export function serve(controller, { socketPath, idleMs = 10000, exit = () => process.exit(0) }) {
  const methods = buildMethods(controller);
  const clients = new Set();
  let idleTimer = null;
  let isClosed = false;

  const pidPath = process.platform === 'win32'
    ? null
    : path.join(path.dirname(socketPath), 'daemon.pid');

  function writePidFile() {
    if (!pidPath) return;
    try { fs.writeFileSync(pidPath, String(process.pid)); } catch {}
  }
  function removePidFile() {
    if (!pidPath) return;
    try { fs.unlinkSync(pidPath); } catch {}
  }

  function scheduleIdleCheck() {
    if (clients.size > 0 || isClosed) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (clients.size === 0 && !isClosed) {
        closeServer();
        try { controller.dispose && controller.dispose(); } catch {}
        exit();
      }
    }, idleMs);
    if (idleTimer.unref) idleTimer.unref();
  }

  function cancelIdleCheck() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  // Subscribe to Controller events (once, at the server level)
  const eventsToForward = ['log', 'log:reset', 'mismatches', 'state', 'git', 'progress'];
  const eventHandlers = {};

  for (const ev of eventsToForward) {
    const handler = (payload) => {
      const msg = JSON.stringify({ t: 'event', event: ev, payload }) + '\n';
      for (const client of clients) {
        if (!client.destroyed) {
          try { client.write(msg); } catch {}
        }
      }
    };
    eventHandlers[ev] = handler;
    controller.on(ev, handler);
  }

  const server = net.createServer((socket) => {
    if (isClosed) {
      socket.destroy();
      return;
    }
    clients.add(socket);
    cancelIdleCheck();

    // Send a snapshot immediately after connecting
    try {
      const snapshot = {
        t: 'snapshot',
        state: controller.getState(),
        log: controller.getLog(0),
        mismatches: controller.getMismatches(),
      };
      socket.write(JSON.stringify(snapshot) + '\n');
    } catch {}

    // Send git status to this client only
    if (typeof controller.gitStatus === 'function') {
      controller.gitStatus().then((g) => {
        if (!socket.destroyed) {
          try { socket.write(JSON.stringify({ t: 'event', event: 'git', payload: g }) + '\n'); } catch {}
        }
      }).catch(() => {});
    }

    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        handleMessage(socket, line);
      }
    });

    const cleanupClient = () => {
      clients.delete(socket);
      scheduleIdleCheck();
    };

    socket.on('close', cleanupClient);
    socket.on('error', cleanupClient);
  });

  async function handleMessage(socket, line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.t !== 'call') return;
    const { id, method, arg } = msg;
    const fn = methods[method];
    if (!fn) {
      const errResp = JSON.stringify({
        t: 'result',
        id,
        ok: false,
        error: { message: 'Unknown method: ' + method }
      }) + '\n';
      if (!socket.destroyed) try { socket.write(errResp); } catch {}
      return;
    }

    try {
      const value = await fn(arg);
      const okResp = JSON.stringify({ t: 'result', id, ok: true, value }) + '\n';
      if (!socket.destroyed) try { socket.write(okResp); } catch {}
    } catch (err) {
      const errResp = JSON.stringify({
        t: 'result',
        id,
        ok: false,
        error: { message: (err && err.message) || String(err) }
      }) + '\n';
      if (!socket.destroyed) try { socket.write(errResp); } catch {}
    }
  }

  if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
    try {
      const probeClient = net.connect(socketPath);
      probeClient.on('connect', () => {
        probeClient.destroy();
        process.exit(0);
      });
      probeClient.on('error', () => {
        probeClient.destroy();
        try { fs.unlinkSync(socketPath); } catch {}
        startListening();
      });
    } catch {
      try { fs.unlinkSync(socketPath); } catch {}
      startListening();
    }
  } else {
    startListening();
  }

  function startListening() {
    if (isClosed) return;
    server.listen(socketPath, () => {
      if (process.platform !== 'win32') {
        try { fs.chmodSync(socketPath, 0o600); } catch {}
      }
      writePidFile();
      scheduleIdleCheck();
    });
  }

  function closeServer() {
    isClosed = true;
    cancelIdleCheck();
    removePidFile();
    for (const ev of eventsToForward) {
      if (eventHandlers[ev]) {
        controller.removeListener(ev, eventHandlers[ev]);
      }
    }
    for (const client of clients) {
      try { client.destroy(); } catch {}
    }
    clients.clear();
    try { server.close(); } catch {}
    if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
      try { fs.unlinkSync(socketPath); } catch {}
    }
  }

  return {
    close: closeServer,
  };
}
