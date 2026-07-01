import React from 'react';
import { useApp } from '../App.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmt } from '@/lib/utils';

// Read-only podgląd różnic przed rozwiązaniem konfliktu. `preview` pochodzi z
// IPC (main policzył wiersze przez buildDiffRows): { kind, rows, added, removed }
// albo { kind:'binary'|'tooLarge' }. Renderer tylko maluje — bez importu core.
export default function DiffDialog({ open, onOpenChange, title, preview }) {
  const { t } = useApp();

  let body;
  if (!preview || preview.kind === 'binary') {
    body = <p className="text-sm text-muted-foreground">{t.DiffBinary}</p>;
  } else if (preview.kind === 'tooLarge') {
    body = <p className="text-sm text-muted-foreground">{t.DiffTooLarge}</p>;
  } else {
    const rows = preview.rows || [];
    const gutterW = String(Math.max(1, ...rows.map((r) => Math.max(r.aLn || 0, r.bLn || 0)))).length;
    body = (
      <div className="max-h-[60vh] overflow-auto rounded-md border border-border bg-card/40 p-2 font-mono text-xs leading-relaxed">
        {rows.length === 0
          ? <p className="text-muted-foreground">{t.DiffNoChanges}</p>
          : rows.map((r, i) => {
              if (r.type === 'fold') {
                return <div key={i} className="text-muted-foreground">{'  '.padStart(gutterW)}  {fmt(t.DiffFold, { count: r.count })}</div>;
              }
              const ln = r.type === 'del' ? r.aLn : r.bLn;
              const cls = r.type === 'add' ? 'text-green-500' : r.type === 'del' ? 'text-red-500' : '';
              const sign = r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' ';
              return (
                <div key={i} className="whitespace-pre">
                  <span className="text-muted-foreground">{String(ln).padStart(gutterW)} </span>
                  <span className={cls}>{sign} {r.line}</span>
                </div>
              );
            })}
      </div>
    );
  }

  const summary = preview && preview.kind === 'text'
    ? (preview.added === 0 && preview.removed === 0 ? t.DiffNoChanges : fmt(t.DiffSummary, { added: preview.added, removed: preview.removed }))
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="font-mono text-sm">{title}</DialogTitle></DialogHeader>
        {body}
        {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
      </DialogContent>
    </Dialog>
  );
}
