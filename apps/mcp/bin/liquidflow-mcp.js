#!/usr/bin/env node
// Punkt wejścia serwera MCP `liquidflow-mcp` (transport stdio).
// UWAGA: stdout należy do protokołu MCP — żadnych console.log.
import { Controller } from '@liquidflow/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '../src/server.js';

const ctrl = new Controller();
const server = buildServer(ctrl);

const shutdown = () => { try { ctrl.dispose(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
