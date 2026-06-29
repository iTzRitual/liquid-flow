import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ConfirmButton from './ConfirmButton.jsx';
import DiffDialog from './DiffDialog.jsx';
import { fmtDate, fmt } from '@/lib/utils';
import { Download, Upload, Trash2, CheckCircle2, ArrowDownToLine, ArrowUpFromLine, FileWarning, Eye } from 'lucide-react';

const TYPE_META = {
  Timestamp: { variant: 'warning', icon: FileWarning, key: 'FileMismatch' },
  RemoteMissing: { variant: 'destructive', icon: ArrowUpFromLine, key: 'FileRemoteMissing' },
  LocalMissing: { variant: 'destructive', icon: ArrowDownToLine, key: 'FileLocalMissing' },
};

export default function ConflictsPanel() {
  const { t, api, call, mismatches } = useApp();

  if (!mismatches.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="text-sm">{t.AllSyncedNoConflicts}</p>
      </div>
    );
  }

  const cmd = (data) => call(() => api.runCommand(data));

  const [pv, setPv] = useState({ open: false, title: '', preview: null });
  const [pvBusy, setPvBusy] = useState(false);
  const preview = async (m) => {
    setPvBusy(true);
    try {
      const p = await call(() => api.previewConflict({ file: m.File, type: m.Type }));
      setPv({ open: true, title: fmt(t.DiffTitle, { name: m.File.Name }), preview: p });
    } finally { setPvBusy(false); }
  };

  return (
    <div className="space-y-2 py-2">
      {mismatches.map((m, i) => {
        const meta = TYPE_META[m.Type] || TYPE_META.Timestamp;
        const Icon = meta.icon;
        return (
          <Card key={`${m.File.Mode}/${m.File.Name}`} className="flex flex-wrap items-center gap-3 p-3">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="truncate text-sm">{m.File.Mode}/{m.File.Name}</code>
                <Badge variant={meta.variant} className="shrink-0">{t[meta.key]}</Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                <span title={t.FileTsFs}>📄 {fmtDate(m.FileTs)}</span>
                <span title={t.FileTsLocal}>💾 {fmtDate(m.LocalTs)}</span>
                <span title={t.FileTsRemote}>☁️ {fmtDate(m.RemoteTs)}</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" size="sm" disabled={pvBusy} onClick={() => preview(m)}>
                <Eye className="h-4 w-4" /> {t.ActionPreviewShort}
              </Button>
              {(m.Type === 'Timestamp' || m.Type === 'LocalMissing') && (
                <ConfirmButton variant="outline" onConfirm={() => cmd({ comm: 'download', file: m.File })} confirmLabel={t.Download}>
                  <Download className="h-4 w-4" /> {t.Download}
                </ConfirmButton>
              )}
              {(m.Type === 'Timestamp' || m.Type === 'RemoteMissing') && (
                <ConfirmButton variant="outline" onConfirm={() => cmd({ comm: 'upload', file: m.File, type: m.Type })} confirmLabel={t.Upload}>
                  <Upload className="h-4 w-4" /> {t.Upload}
                </ConfirmButton>
              )}
              {m.Type === 'RemoteMissing' && (
                <ConfirmButton variant="destructive" onConfirm={() => cmd({ comm: 'removeLocal', file: m.File })} confirmLabel={t.Delete}>
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              )}
              {m.Type === 'LocalMissing' && (
                <ConfirmButton variant="destructive" onConfirm={() => cmd({ comm: 'removeRemote', file: m.File })} confirmLabel={t.Delete}>
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              )}
            </div>
          </Card>
        );
      })}
      <DiffDialog open={pv.open} onOpenChange={(o) => setPv((s) => ({ ...s, open: o }))} title={pv.title} preview={pv.preview} />
    </div>
  );
}
