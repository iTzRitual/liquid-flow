#!/usr/bin/env node
// Entry point for the `liquidflow-mcp` MCP server (stdio transport).
// NOTE: stdout belongs to the MCP protocol — no console.log.
import { connectController } from '@liquidflow/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '../src/server.js';

const ctrl = await connectController({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
const server = buildServer(ctrl);

const shutdown = () => { try { ctrl.dispose(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
