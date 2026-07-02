import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Controller } from '../controller.js';
import * as store from '../store.js';
import * as logbuf from '../log.js';
import { serve } from './server.js';
import { DaemonClient } from './client.js';

describe('Daemon — integration', () => {
  let ctrl;
  let server;
  let clients = [];
  let socketPath;

  beforeEach(() => {
    logbuf.setActiveChannel('app');
    socketPath = store.daemonSocketPath();
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.dispose(); } catch {}
    }
    clients = [];
    if (server) {
      try { server.close(); } catch {}
      server = null;
    }
    if (ctrl) {
      try { ctrl.dispose(); } catch {}
      ctrl = null;
    }
    logbuf.setActiveChannel('app');
  });

  it('Snapshot on connect: sets state, log, mismatches', async () => {
    ctrl = new Controller();
    server = serve(ctrl, { socketPath });

    const client = await DaemonClient.connect(socketPath);
    clients.push(client);

    expect(client.getState()).not.toBeNull();
    expect(client.getState()).toEqual(ctrl.getState());
    expect(client.getMismatches()).toEqual(ctrl.getMismatches());
    expect(client.getLog(0)).toEqual(ctrl.getLog(0));
  });

  it('Two clients, cross-client state broadcast', async () => {
    ctrl = new Controller();
    server = serve(ctrl, { socketPath });

    const clientA = await DaemonClient.connect(socketPath);
    const clientB = await DaemonClient.connect(socketPath);
    clients.push(clientA, clientB);

    let clientBStateReceived = null;
    clientB.on('state', (st) => { clientBStateReceived = st; });

    await clientA.setLanguage('en');

    expect(clientBStateReceived).toBeTruthy();
    expect(clientBStateReceived.language).toBe('en');
    expect(clientB.getState().language).toBe('en');
    expect(ctrl.getState().language).toBe('en');
  });

  it('Log broadcast: log event updates mirror log across clients', async () => {
    ctrl = new Controller();
    server = serve(ctrl, { socketPath });

    const clientA = await DaemonClient.connect(socketPath);
    const clientB = await DaemonClient.connect(socketPath);
    clients.push(clientA, clientB);

    let clientALogEvent = null;
    let clientBLogEvent = null;

    clientA.on('log', (entry) => { clientALogEvent = entry; });
    clientB.on('log', (entry) => { clientBLogEvent = entry; });

    logbuf.events.emit('entry', { Id: 99, Message: 'Test daemon log', Level: 'info' });

    await new Promise((r) => setTimeout(r, 50));

    expect(clientALogEvent).toBeTruthy();
    expect(clientALogEvent.Message).toBe('Test daemon log');
    expect(clientBLogEvent).toBeTruthy();
    expect(clientBLogEvent.Message).toBe('Test daemon log');

    expect(clientA.getLog(0).some((e) => e.Message === 'Test daemon log')).toBe(true);
    expect(clientB.getLog(0).some((e) => e.Message === 'Test daemon log')).toBe(true);
  });

  it('RPC error propagation: rejects with error message', async () => {
    ctrl = new Controller();
    server = serve(ctrl, { socketPath });

    const client = await DaemonClient.connect(socketPath);
    clients.push(client);

    await expect(client.gitEnable()).rejects.toThrow();
  });

  it('Unknown method: rejects with Unknown method error', async () => {
    ctrl = new Controller();
    server = serve(ctrl, { socketPath });

    const client = await DaemonClient.connect(socketPath);
    clients.push(client);

    await expect(client.call('does.not.exist')).rejects.toThrow(/Unknown method/);
  });

  it('dispose() only disconnects client, server remains running for others', async () => {
    ctrl = new Controller();
    server = serve(ctrl, { socketPath });

    const clientA = await DaemonClient.connect(socketPath);
    const clientB = await DaemonClient.connect(socketPath);
    clients.push(clientA, clientB);

    let clientBStateReceived = null;
    clientB.on('state', (st) => { clientBStateReceived = st; });

    clientA.dispose();

    await clientB.setLanguage('pl');

    expect(clientBStateReceived).toBeTruthy();
    expect(clientBStateReceived.language).toBe('pl');
    expect(clientB.getState().language).toBe('pl');
  });
});
