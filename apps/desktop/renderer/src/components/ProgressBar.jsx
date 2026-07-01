import React from 'react';
import { useApp } from '../App.jsx';
import { Loader2 } from 'lucide-react';

// Loader startu synchronizacji. `progress` to surowy payload z rdzenia:
// { phase:'download'|'check'|'ready', state:'start'|'progress'|'done', done?, total? }.
export default function ProgressBar({ progress }) {
  const { t } = useApp();
  if (!progress || progress.phase === 'ready') return null;

  const label = progress.phase === 'download' ? t.DownloadingFiles
    : progress.phase === 'check' ? t.CheckingMismatch : '';
  if (!label) return null;

  const determinate = progress.phase === 'download' && progress.state === 'progress' && progress.total > 0;
  const pct = determinate ? Math.round(Math.min(1, progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex w-full items-center gap-3 border-b border-border bg-card/40 px-6 py-2 text-xs">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
        <div
          className={determinate ? 'h-full bg-primary transition-all' : 'h-full w-1/3 animate-pulse bg-primary'}
          style={determinate ? { width: `${pct}%` } : undefined}
        />
      </div>
      {determinate && <span className="shrink-0 tabular-nums text-muted-foreground">{pct}% · {progress.done}/{progress.total}</span>}
    </div>
  );
}
