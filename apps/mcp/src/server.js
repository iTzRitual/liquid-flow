// Serwer MCP (Model Context Protocol) dla Liquid Flow pozwalający agentom AI
// sterować synchronizacją, konfliktami, logami oraz git-checkpointami.
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { store, diffSummary } from '@liquidflow/core';

// Wczytanie wersji z lokalnego package.json
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export function buildServer(ctrl) {
  const server = new McpServer({ name: 'liquid-flow', version });

  // Pomocnicze funkcje do formatowania odpowiedzi zgodnie z protokołem MCP
  const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
  const wrap = (fn) => async (args) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return {
        content: [{ type: 'text', text: String(e && e.message || e) }],
        isError: true
      };
    }
  };

  // 1. status — Zwraca ogólny stan synchronizacji i gita
  server.registerTool(
    'status',
    {
      description: 'Get the current status of the sync engine, including the active shop, selected template, local config, and git status summary if active.'
    },
    wrap(async () => {
      const state = ctrl.getState();
      let conflicts = 0;
      try {
        conflicts = ctrl.getMismatches().length;
      } catch (e) {}
      let gitInfo = null;
      const gitSt = await ctrl.gitStatus();
      if (gitSt && gitSt.active) {
        gitInfo = {
          active: gitSt.active,
          branch: gitSt.branch,
          ahead: gitSt.ahead,
          dirty: gitSt.dirty
        };
      }
      return {
        currentShop: state.currentShop,
        currentTemplate: state.currentTemplate,
        language: state.language,
        insecureTLS: state.insecureTLS,
        logWrap: state.logWrap,
        headerMode: state.headerMode,
        conflicts,
        git: gitInfo
      };
    })
  );

  // 2. list_shops — Pobiera listę zapisanych sklepów
  server.registerTool(
    'list_shops',
    {
      description: 'List all shops saved in the local configuration.'
    },
    wrap(async () => {
      return ctrl.listShops();
    })
  );

  // 3. connect_shop — Łączy z zapisanym sklepem (wymaga zapisanego hasła)
  server.registerTool(
    'connect_shop',
    {
      description: 'Connect to a saved shop by its ID. This only works for shops saved with a stored password. To add a new shop or change credentials, use the Liquid Flow CLI or desktop app.',
      inputSchema: {
        shopId: z.number().describe('The ID of the saved shop to connect to.')
      }
    },
    wrap(async ({ shopId }) => {
      return await ctrl.signInSaved(shopId);
    })
  );

  // 4. disconnect — Rozłącza bieżący sklep i czyści sesję
  server.registerTool(
    'disconnect',
    {
      description: 'Disconnect from the current shop and stop any active sync session.'
    },
    wrap(async () => {
      return ctrl.logout();
    })
  );

  // 5. list_templates — Pobiera szablony dostępne w sklepie
  server.registerTool(
    'list_templates',
    {
      description: 'List all templates available in the connected shop.'
    },
    wrap(async () => {
      return await ctrl.listTemplates();
    })
  );

  // 6. select_template — Wybiera szablon i startuje SyncSession
  server.registerTool(
    'select_template',
    {
      description: 'Select a template by its ID to start a sync session. This downloads files and starts monitoring. The template must be unlocked. Initial download may take a while.',
      inputSchema: {
        templateId: z.number().describe('The ID of the template to select.')
      }
    },
    wrap(async ({ templateId }) => {
      const r = await ctrl.selectTemplate(templateId);
      if (r.Locked) {
        throw new Error('Template is locked; unlock it once in the Liquid Flow CLI or desktop app first.');
      }
      return {
        ...r,
        workspace: await ctrl.currentFolder()
      };
    })
  );

  // 7. get_workspace_info — Zwraca ścieżki do edycji plików szablonu
  server.registerTool(
    'get_workspace_info',
    {
      description: 'Get the directories for the active sync session workspace. You should edit files in the edit directory, and changes will be automatically uploaded.'
    },
    wrap(async () => {
      const st = ctrl.getState();
      if (!st || !st.currentTemplate || !st.currentShop) {
        throw new Error('No active sync session — call select_template first.');
      }
      const templateDir = await ctrl.currentFolder();
      // editDir = tryb roboczy '0'; policz lokalnie przez store (czysta ścieżka)
      const editDir = store.templateModeDir(st.currentShop.Name, st.currentTemplate.Id, 0);
      return {
        templateDir,
        editDir,
        note: 'Edit files under editDir with your own file tools; every save is hot-reloaded to the shop automatically. Paths containing a dot-segment (.git, .DS_Store) are ignored. Check get_logs afterwards to confirm the upload.'
      };
    })
  );

  // 8. list_conflicts — Listuje aktualne konflikty (mismatches)
  server.registerTool(
    'list_conflicts',
    {
      description: 'Get the current list of mismatches/conflicts between local files and the Comarch e-Sklep server.'
    },
    wrap(async () => {
      const mismatches = await ctrl.recheckMismatches();
      return mismatches.map(m => ({
        name: m.File.Name,
        mode: m.File.Mode,
        type: m.Type,
        localTs: m.FileTs ?? null,
        remoteTs: m.RemoteTs ?? null
      }));
    })
  );

  // 9. resolve_conflict — Rozwiązuje konflikty plikowe
  server.registerTool(
    'resolve_conflict',
    {
      description: 'Resolve a file conflict by running a sync command (download, upload, removeLocal, removeRemote, downloadAll, uploadAll). Note that removeLocal/removeRemote will delete files, and downloadAll/uploadAll overwrite all conflicts on one side.',
      inputSchema: {
        command: z.enum(['download', 'upload', 'removeLocal', 'removeRemote', 'downloadAll', 'uploadAll']).describe('The command to run to resolve the conflict.'),
        name: z.string().optional().describe('The name of the file (required for per-file commands).'),
        mode: z.number().optional().describe('The mode/type of the file (optional).')
      }
    },
    wrap(async ({ command, name, mode }) => {
      if (command === 'downloadAll' || command === 'uploadAll') {
        await ctrl.runCommand({ comm: command });
      } else {
        if (!name) {
          throw new Error('name parameter is required for command ' + command);
        }
        const mismatches = ctrl.getMismatches();
        const m = mismatches.find(x => x.File.Name === name && (mode === undefined || x.File.Mode === mode));
        if (!m) {
          throw new Error('No such conflict');
        }
        await ctrl.runCommand({ comm: command, file: m.File, type: m.Type });
      }
      const fresh = await ctrl.recheckMismatches();
      return fresh.map(m => ({
        name: m.File.Name,
        mode: m.File.Mode,
        type: m.Type,
        localTs: m.FileTs ?? null,
        remoteTs: m.RemoteTs ?? null
      }));
    })
  );

  // 10. preview_conflict — Pokazuje różnice w plikach tekstowych przed rozstrzygnięciem
  server.registerTool(
    'preview_conflict',
    {
      description: 'Get a diff preview of a conflict for a specific file.',
      inputSchema: {
        name: z.string().describe('The name of the file.'),
        mode: z.number().optional().describe('The mode/type of the file (optional).')
      }
    },
    wrap(async ({ name, mode }) => {
      const mismatches = ctrl.getMismatches();
      const m = mismatches.find(x => x.File.Name === name && (mode === undefined || x.File.Mode === mode));
      if (!m) {
        throw new Error('No such conflict');
      }
      const p = await ctrl.previewConflict(m.File, m.Type);
      if (!p) {
        return null;
      }
      if (p.kind === 'text') {
        const summary = diffSummary(p.diff);
        let local = p.local || '';
        let remote = p.remote || '';
        let localTruncated = false;
        let remoteTruncated = false;
        if (local.length > 20000) {
          local = local.slice(0, 20000);
          localTruncated = true;
        }
        if (remote.length > 20000) {
          remote = remote.slice(0, 20000);
          remoteTruncated = true;
        }
        return {
          kind: p.kind,
          summary,
          local,
          localTruncated,
          remote,
          remoteTruncated
        };
      }
      return {
        kind: p.kind,
        side: p.side
      };
    })
  );

  // 11. get_logs — Cykliczne pobieranie logów synchronizacji (ostatnie 200 wpisów)
  server.registerTool(
    'get_logs',
    {
      description: 'Get active sync logs. Returns entries with IDs so you can poll incrementally. Caps at last 200 entries.',
      inputSchema: {
        sinceId: z.number().optional().describe('Filter logs to only those with an ID greater than this value (optional).')
      }
    },
    wrap(async ({ sinceId }) => {
      const logs = ctrl.getLog(sinceId ?? 0);
      const mapped = logs.map(e => ({
        id: e.Id,
        ts: e.TS,
        text: e.Text
      })).slice(-200);
      const lastId = mapped.reduce((max, e) => e.id > max ? e.id : max, sinceId ?? 0);
      return {
        logs: mapped,
        lastId
      };
    })
  );

  // 12. git_status — Status lokalnego git repozytorium
  server.registerTool(
    'git_status',
    {
      description: 'Get the status of the local git repository for the active template.'
    },
    wrap(async () => {
      return await ctrl.gitStatus();
    })
  );

  // 13. git_history — Historia commitów w lokalnym repo
  server.registerTool(
    'git_history',
    {
      description: 'Get the commit history of the local git repository for the active template.',
      inputSchema: {
        limit: z.number().optional().describe('Maximum number of commit history entries to return (default 20, optional).')
      }
    },
    wrap(async ({ limit }) => {
      return await ctrl.gitHistory(limit ?? 20);
    })
  );

  // 14. git_checkpoint — Tworzy checkpoint, scalając wip do głównej gałęzi
  server.registerTool(
    'git_checkpoint',
    {
      description: 'Create a named checkpoint commit, squashing auto-committed work-in-progress on the active template\'s target branch.',
      inputSchema: {
        message: z.string().describe('The commit message for the checkpoint.')
      }
    },
    wrap(async ({ message }) => {
      return await ctrl.gitCheckpoint(message);
    })
  );

  return server;
}
