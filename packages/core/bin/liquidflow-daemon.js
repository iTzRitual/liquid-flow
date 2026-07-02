#!/usr/bin/env node
// Nagłówek: proces-demon trzymający JEDEN Controller współdzielony przez CLI/desktop/MCP.
import { Controller } from '../src/controller.js';
import { serve } from '../src/daemon/server.js';
import * as store from '../src/store.js';

const ctrl = new Controller({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
const server = serve(ctrl, { socketPath: store.daemonSocketPath() });

const shutdown = () => { try { server.close(); } catch {} try { ctrl.dispose(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
