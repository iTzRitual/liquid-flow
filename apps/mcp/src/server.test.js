import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Controller } from '../../../packages/core/src/controller.js';
import * as store from '../../../packages/core/src/store.js';
import * as logbuf from '../../../packages/core/src/log.js';
import { startMockSoap, liquidTemplateXml } from '../../../test/helpers/mockSoapServer.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from './server.js';

let ctrl, srv, shopName, client, clientTransport, serverTransport, n = 0;
const handlers = {};

const TEMPLATE_XML = '<Liquid><Id>5</Id><Name>Topaz</Name><Locked>false</Locked><HasPassword>false</HasPassword></Liquid>';
const FILE = liquidTemplateXml({ id: 5, mode: 0, name: 'index.liquid', content: 'WITAJ', date: '2026-01-01T00:00:00' });
const META = liquidTemplateXml({ mode: 0, name: 'index.liquid', date: '2026-01-01T00:00:00' });

beforeEach(() => {
  try { fs.rmSync(store.paths.CONFIG_PATH); } catch {}
  logbuf.setActiveChannel('app');
  shopName = `McpShop${n++}`;
  // Reset SOAP handlers for each test
  Object.keys(handlers).forEach(k => delete handlers[k]);
  handlers.SignIn = () => true;
  handlers.Liquid_Get = () => ({ resultXml: TEMPLATE_XML });
  handlers.Liquid_FilesGet = () => ({ resultXml: FILE });
  handlers.Liquid_FilesMetaGet = () => ({ resultXml: META });
});

afterEach(async () => {
  if (client) { await client.close(); client = null; }
  if (ctrl) { ctrl.dispose(); ctrl = null; }
  if (srv) { await srv.close(); srv = null; }
});

const parse = (r) => JSON.parse(r.content[0].text);

async function setupMcp() {
  srv = await startMockSoap({ handlers });
  const cfg = store.loadConfig();
  cfg.Shops = [{ Id: 1, Name: shopName, Url: srv.url, Login: 'webmaster', SavePassword: true, Password: 'pw' }];
  store.saveConfig(cfg);

  ctrl = new Controller();
  const mcpServer = buildServer(ctrl);

  const [ct, st] = InMemoryTransport.createLinkedPair();
  clientTransport = ct;
  serverTransport = st;
  await mcpServer.connect(serverTransport);

  client = new Client({ name: 'test-harness', version: '1.0.0' });
  await client.connect(clientTransport);
}

describe('MCP Server Integration Tests', () => {
  it('list_shops returns seeded shop; status shows currentShop: null before connecting', async () => {
    await setupMcp();
    const resShops = await client.callTool({ name: 'list_shops', arguments: {} });
    const shops = parse(resShops);
    expect(shops).toHaveLength(1);
    expect(shops[0].Name).toBe(shopName);

    const resStatus = await client.callTool({ name: 'status', arguments: {} });
    const status = parse(resStatus);
    expect(status.currentShop).toBeNull();
  });

  it('connect_shop sets active shop; unknown shop returns error', async () => {
    await setupMcp();
    const connectRes = await client.callTool({ name: 'connect_shop', arguments: { shopId: 1 } });
    const connected = parse(connectRes);
    expect(connected.Name).toBe(shopName);

    const resStatus = await client.callTool({ name: 'status', arguments: {} });
    const status = parse(resStatus);
    expect(status.currentShop.Name).toBe(shopName);

    const failRes = await client.callTool({ name: 'connect_shop', arguments: { shopId: 999 } });
    expect(failRes.isError).toBe(true);
    expect(failRes.content[0].text).toBeTruthy();
  });

  it('list_templates returns mock templates', async () => {
    await setupMcp();
    await client.callTool({ name: 'connect_shop', arguments: { shopId: 1 } });
    const tplsRes = await client.callTool({ name: 'list_templates', arguments: {} });
    const templates = parse(tplsRes);
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ Id: 5, Name: 'Topaz' });
  });

  it('select_template downloads files and returns workspace info', async () => {
    await setupMcp();
    await client.callTool({ name: 'connect_shop', arguments: { shopId: 1 } });
    const selRes = await client.callTool({ name: 'select_template', arguments: { templateId: 5 } });
    const selection = parse(selRes);
    expect(selection).toMatchObject({ Id: 5, Name: 'Topaz', Locked: false });
    expect(selection.workspace).toBe(store.templateDir(shopName, 5));

    const abs = store.localFilePath(shopName, 5, 0, 'index.liquid');
    expect(fs.readFileSync(abs, 'utf8')).toBe('WITAJ');
  });

  it('get_workspace_info returns directories or error if no session', async () => {
    await setupMcp();

    // No active session
    const infoErr = await client.callTool({ name: 'get_workspace_info', arguments: {} });
    expect(infoErr.isError).toBe(true);

    // Active session
    await client.callTool({ name: 'connect_shop', arguments: { shopId: 1 } });
    await client.callTool({ name: 'select_template', arguments: { templateId: 5 } });

    const infoRes = await client.callTool({ name: 'get_workspace_info', arguments: {} });
    const info = parse(infoRes);
    expect(info.templateDir).toBe(store.templateDir(shopName, 5));
    expect(info.editDir).toContain(path.join('files', '5', '0'));
  });

  it('conflict round-trip: detects Timestamp conflict, resolves via download, updates local content', async () => {
    await setupMcp();
    await client.callTool({ name: 'connect_shop', arguments: { shopId: 1 } });
    await client.callTool({ name: 'select_template', arguments: { templateId: 5 } });

    // Override SOAP metadata and content to simulate a remote update (conflict)
    const NEW_FILE = liquidTemplateXml({ id: 5, mode: 0, name: 'index.liquid', content: 'NOWA', date: '2026-06-01T00:00:00' });
    const NEW_META = liquidTemplateXml({ mode: 0, name: 'index.liquid', date: '2026-06-01T00:00:00' });
    handlers.Liquid_FilesMetaGet = () => ({ resultXml: NEW_META });
    handlers.Liquid_FilesGet = () => ({ resultXml: NEW_FILE });

    const confRes = await client.callTool({ name: 'list_conflicts', arguments: {} });
    const conflicts = parse(confRes);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      name: 'index.liquid',
      type: 'Timestamp',
      remoteTs: '2026-06-01T00:00:00'
    });

    // Resolve conflict using download
    const resolveRes = await client.callTool({
      name: 'resolve_conflict',
      arguments: { command: 'download', name: 'index.liquid' }
    });
    const remaining = parse(resolveRes);
    expect(remaining).toHaveLength(0);

    // Assert file content is now the remote one
    const abs = store.localFilePath(shopName, 5, 0, 'index.liquid');
    expect(fs.readFileSync(abs, 'utf8')).toBe('NOWA');
  });

  it('resolve_conflict returns error when name is missing or file is not in conflict', async () => {
    await setupMcp();
    await client.callTool({ name: 'connect_shop', arguments: { shopId: 1 } });
    await client.callTool({ name: 'select_template', arguments: { templateId: 5 } });

    const errNoName = await client.callTool({
      name: 'resolve_conflict',
      arguments: { command: 'download' }
    });
    expect(errNoName.isError).toBe(true);

    const errBadName = await client.callTool({
      name: 'resolve_conflict',
      arguments: { command: 'download', name: 'non-existent.liquid' }
    });
    expect(errBadName.isError).toBe(true);
  });

  it('get_logs retrieves logged sync history incrementally', async () => {
    await setupMcp();
    await client.callTool({ name: 'connect_shop', arguments: { shopId: 1 } });
    await client.callTool({ name: 'select_template', arguments: { templateId: 5 } });

    const logsRes = await client.callTool({ name: 'get_logs', arguments: {} });
    const data = parse(logsRes);
    expect(data.logs.length).toBeGreaterThan(0);
    expect(data.lastId).toBeGreaterThan(0);

    const nextRes = await client.callTool({ name: 'get_logs', arguments: { sinceId: data.lastId } });
    const nextData = parse(nextRes);
    expect(nextData.logs).toHaveLength(0);
    expect(nextData.lastId).toBe(data.lastId);
  });
});
