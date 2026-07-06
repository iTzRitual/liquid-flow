import React, { useEffect, useRef } from 'react';
import { useApp } from '../App.jsx';
import { fmtDate, cn } from '@/lib/utils';

export default function LogPanel() {
  const { t, log } = useApp();
  const ref = useRef(null);

  // the log is kept newest-first — we display it in descending order
  return (
    <div ref={ref} className="h-full overflow-y-auto rounded-lg border border-border bg-card/40 p-2 font-mono text-xs">
      {log.length === 0 && <p className="p-3 text-muted-foreground">{t.NoEntries}</p>}
      <ul className="space-y-0.5">
        {log.map((e) => {
          // Separator (a session boundary) — a divider line instead of a regular entry.
          if (e.kind === 'separator') {
            return (
              <li key={e.Id} className="flex items-center gap-2 px-2 py-1 text-[11px]" style={{ color: e.Color }}>
                <span className="h-px flex-1" style={{ backgroundColor: e.Color, opacity: 0.4 }} />
                <span className="shrink-0">{e.Text}</span>
                <span className="h-px flex-1" style={{ backgroundColor: e.Color, opacity: 0.4 }} />
              </li>
            );
          }
          // A historic entry (previous session) — dimmed.
          return (
            <li key={e.Id} className={cn('flex gap-3 rounded px-2 py-1 hover:bg-accent/50', e.historic && 'opacity-50')}>
              <span className="shrink-0 text-muted-foreground">{fmtDate(e.TS)}</span>
              <span style={{ color: e.Color }}>{e.Text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
