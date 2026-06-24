import React, { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ConfirmButton from './ConfirmButton.jsx';
import ConflictsPanel from './ConflictsPanel.jsx';
import LogPanel from './LogPanel.jsx';
import GitPanel from './GitPanel.jsx';
import { FolderOpen, Globe, RefreshCw, AlertTriangle, ScrollText, GitBranch, Download, Upload, CircleDot } from 'lucide-react';

export default function SyncView() {
  const { t, api, call, currentShop, currentTemplate, mismatches, setMismatches, setLog, setGit } = useApp();
  const [tab, setTab] = useState('conflicts');

  useEffect(() => {
    (async () => {
      setMismatches(await api.getMismatches());
      setLog((await api.getLog(0)).slice().reverse());
      try { setGit(await api.git.status()); } catch {}
    })();
    // eslint-disable-next-line
  }, [currentTemplate && currentTemplate.Id]);

  const refresh = () => call(() => api.runCommand({ comm: 'refr' }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* nagłówek */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{currentTemplate?.Name}</h2>
            <Badge variant="secondary">ID {currentTemplate?.Id}</Badge>
            {mismatches.length > 0
              ? <Badge variant="warning" className="gap-1"><CircleDot className="h-3 w-3" /> {mismatches.length}</Badge>
              : <Badge variant="success" className="gap-1"><CircleDot className="h-3 w-3" /> OK</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{currentShop?.Name} · {currentShop?.Url}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => api.openFolder()}><FolderOpen className="h-4 w-4" /> {t.OpenLocalFolder}</Button>
        <Button variant="outline" size="sm" onClick={() => api.openShop()}><Globe className="h-4 w-4" /> {t.OpenShop}</Button>
        <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4" /> {t.Refresh}</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-6 pt-3">
          <TabsList>
            <TabsTrigger value="conflicts"><AlertTriangle className="h-4 w-4" /> {t.Files}
              {mismatches.length > 0 && <Badge variant="warning" className="ml-1 h-4 px-1 text-[10px]">{mismatches.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="log"><ScrollText className="h-4 w-4" /> {t.Log}</TabsTrigger>
            <TabsTrigger value="git"><GitBranch className="h-4 w-4" /> {t.GitBackup}</TabsTrigger>
          </TabsList>

          {tab === 'conflicts' && mismatches.length > 0 && (
            <div className="ml-auto flex gap-2">
              <ConfirmButton variant="outline" onConfirm={() => call(() => api.runCommand({ comm: 'downloadAll' }))} confirmLabel={t.DownloadAll}>
                <Download className="h-4 w-4" /> {t.DownloadAll}
              </ConfirmButton>
              <ConfirmButton variant="outline" onConfirm={() => call(() => api.runCommand({ comm: 'uploadAll' }))} confirmLabel={t.UploadAll}>
                <Upload className="h-4 w-4" /> {t.UploadAll}
              </ConfirmButton>
            </div>
          )}
        </div>

        <TabsContent value="conflicts" className="flex-1 overflow-y-auto px-6 pb-6"><ConflictsPanel /></TabsContent>
        <TabsContent value="log" className="flex-1 overflow-hidden px-6 pb-6"><LogPanel /></TabsContent>
        <TabsContent value="git" className="flex-1 overflow-y-auto px-6 pb-6"><GitPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
