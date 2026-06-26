import React, { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import ConfirmButton from './ConfirmButton.jsx';
import { fmtDate } from '@/lib/utils';
import { GitBranch, GitCommit, History, UploadCloud, RotateCcw, Power, Loader2, Cloud } from 'lucide-react';

export default function GitPanel() {
  const { t, api, call, git, setGit } = useApp();
  const [history, setHistory] = useState([]);
  const [remote, setRemote] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const st = await call(() => api.git.status(), { errorToast: false }).catch(() => null);
    if (st) { setGit(st); setRemote(st.remote || ''); }
    if (st && st.isRepo) setHistory(await api.git.history(50));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  if (git && git.available === false) {
    return (
      <Card className="mt-2">
        <CardHeader><CardTitle>{t.GitUnavailable}</CardTitle>
          <CardDescription>{t.GitInstallHintPre}<code>xcode-select --install</code>{t.GitInstallHintPost}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const enable = async () => { setBusy(true); try { const s = await call(() => api.git.enable()); setGit(s); await reload(); } finally { setBusy(false); } };
  const setSetting = async (patch) => { const s = await call(() => api.git.settings(patch)); setGit(s); };
  const saveRemote = async () => { const s = await call(() => api.git.setRemote(remote)); setGit(s); };
  const push = async () => { setBusy(true); try { await call(() => api.git.push()); await reload(); } finally { setBusy(false); } };
  const restore = async (hash) => { await call(() => api.git.restore(hash)); await reload(); };

  const active = git && git.isRepo;

  return (
    <div className="space-y-4 py-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-primary" /> {t.VersioningBackups}</CardTitle>
          <CardDescription>{t.VersioningDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!active ? (
            <Button onClick={enable} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} {t.EnableVersioning}
            </Button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="success" className="gap-1"><GitCommit className="h-3 w-3" /> {git.commitCount} {t.Versions}</Badge>
                {git.dirty && <Badge variant="warning">{t.UncommittedChanges}</Badge>}
                {git.remote && <Badge variant="secondary" className="gap-1"><Cloud className="h-3 w-3" /> origin</Badge>}
                {git.lastCommit && <span className="text-xs text-muted-foreground">{t.LastLabel}: {git.lastCommit.message} ({git.lastCommit.relative})</span>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span><span className="font-medium">{t.AutoCommit}</span><br /><span className="text-xs text-muted-foreground">{t.AutoCommitDesc}</span></span>
                  <Switch checked={!!git.autoCommit} onCheckedChange={(v) => setSetting({ autoCommit: v })} />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span><span className="font-medium">{t.AutoPush}</span><br /><span className="text-xs text-muted-foreground">{t.AutoPushDesc}</span></span>
                  <Switch checked={!!git.autoPush} disabled={!git.remote} onCheckedChange={(v) => setSetting({ autoPush: v })} />
                </label>
              </div>

              <div className="space-y-1.5">
                <Label>{t.RemoteRepoOrigin}</Label>
                <div className="flex gap-2">
                  <Input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder={t.GitRemotePlaceholder} />
                  <Button variant="secondary" onClick={saveRemote}>{t.Save}</Button>
                  <Button variant="outline" onClick={push} disabled={busy || !git.remote}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Push
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t.AuthHint}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {active && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> {t.VersionHistory}</CardTitle></CardHeader>
          <CardContent>
            {history.length === 0 && <p className="text-sm text-muted-foreground">{t.NoCommits}</p>}
            <ul className="divide-y divide-border">
              {history.map((c) => (
                <li key={c.hash} className="flex items-center gap-3 py-2">
                  <code className="shrink-0 text-xs text-primary">{c.hash}</code>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.message}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(c.iso)}</span>
                  <ConfirmButton variant="outline" size="sm" onConfirm={() => restore(c.hash)}
                    title={t.RestoreVersionQ} message={t.RestoreVersionDesc} confirmLabel={t.Restore}>
                    <RotateCcw className="h-3.5 w-3.5" /> {t.Restore}
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
